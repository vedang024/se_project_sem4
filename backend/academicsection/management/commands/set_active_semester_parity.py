from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from academicsection.models import Branch, BranchBatch, UserProfile


ROMAN = {1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII", 9: "IX", 10: "X"}


def make_batch_name(branch_id, semester):
    return f"{branch_id}-{ROMAN.get(semester, str(semester))}"


class Command(BaseCommand):
    help = "Keep only odd or even semester batches as active set and remap student profiles accordingly."

    def add_arguments(self, parser):
        parser.add_argument("--parity", choices=["odd", "even"], required=True, help="Active semester parity to keep")
        parser.add_argument("--dry-run", action="store_true", help="Show planned changes without writing")

    def handle(self, *args, **options):
        parity = options["parity"]
        dry_run = options["dry_run"]

        keep_mod = 1 if parity == "odd" else 0

        branches = Branch.objects.all().order_by("branch_id")
        if not branches.exists():
            raise CommandError("No branches found.")

        remap_actions = []
        delete_ids = []
        create_actions = []

        for branch in branches:
            max_sem = int(branch.college_years) * 2
            target_semesters = [sem for sem in range(1, max_sem + 1) if sem % 2 == keep_mod]

            existing_batches = {
                batch.year: batch
                for batch in BranchBatch.objects.filter(branch=branch).order_by("year")
            }

            # Ensure one target batch exists for each year using chosen parity.
            for sem in target_semesters:
                if sem not in existing_batches:
                    create_actions.append((branch, sem))

            # Mark opposite parity batches for deletion.
            for sem, batch in existing_batches.items():
                if sem % 2 != keep_mod:
                    delete_ids.append(batch.id)

            # Plan remapping from opposite parity to chosen parity within same academic year.
            profiles = UserProfile.objects.select_related("batch", "branch").filter(role="student", branch=branch, batch__isnull=False)
            for profile in profiles:
                sem = int(profile.batch.year)
                if sem % 2 == keep_mod:
                    continue

                target_sem = sem - 1 if parity == "odd" else sem + 1
                # Clamp for safety, though 1..max_sem should already hold.
                if target_sem < 1:
                    target_sem = 1
                if target_sem > max_sem:
                    target_sem = max_sem

                remap_actions.append((profile.id, profile.batch.id, branch.branch_id, sem, target_sem))

        self.stdout.write(self.style.NOTICE(f"Parity mode: {parity}"))
        self.stdout.write(self.style.NOTICE(f"Batches to create: {len(create_actions)}"))
        self.stdout.write(self.style.NOTICE(f"Student profile remaps: {len(remap_actions)}"))
        self.stdout.write(self.style.NOTICE(f"Batches to delete: {len(delete_ids)}"))

        if dry_run:
            self.stdout.write(self.style.SUCCESS("Dry run complete. No DB changes applied."))
            return

        created_count = 0
        remapped_count = 0
        deleted_count = 0

        with transaction.atomic():
            # Create missing parity batches.
            for branch, sem in create_actions:
                batch_name = make_batch_name(branch.branch_id, sem)
                _, created = BranchBatch.objects.get_or_create(
                    branch=branch,
                    year=sem,
                    batch_name=batch_name,
                    defaults={"college_year": (sem + 1) // 2},
                )
                if created:
                    created_count += 1

            # Refresh lookup after possible creates.
            batch_lookup = {}
            for batch in BranchBatch.objects.select_related("branch").all():
                batch_lookup[(batch.branch_id, batch.year)] = batch

            # Remap student profiles.
            for profile_id, _old_batch_id, branch_id, _old_sem, target_sem in remap_actions:
                target_batch = batch_lookup.get((branch_id, target_sem))
                if target_batch is None:
                    continue
                updated = UserProfile.objects.filter(id=profile_id).update(batch=target_batch)
                if updated:
                    remapped_count += 1

            # Delete opposite parity batches.
            if delete_ids:
                deleted_count, _ = BranchBatch.objects.filter(id__in=delete_ids).delete()

        self.stdout.write(self.style.SUCCESS(f"Created batches: {created_count}"))
        self.stdout.write(self.style.SUCCESS(f"Remapped student profiles: {remapped_count}"))
        self.stdout.write(self.style.SUCCESS(f"Deleted opposite-parity batches: {deleted_count}"))
