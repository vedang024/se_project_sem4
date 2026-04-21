from django.core.management.base import BaseCommand
from django.contrib.auth.models import User, Group


class Command(BaseCommand):
    help = "Setup or reset the master admin user"

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Reset master admin password to default (masterAdmin@123)",
        )

    def handle(self, *args, **options):
        username = "masterAdmin@erp.ac.in"
        password = "masterAdmin@123"

        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "email": username,
                "is_staff": False,
                "is_superuser": False,
                "is_active": True,
            },
        )

        if created:
            user.set_password(password)
            user.save()
            self.stdout.write(
                self.style.SUCCESS(
                    f"[OK] Master admin user created: {username}"
                )
            )
            self.stdout.write(
                self.style.SUCCESS(
                    f"[OK] Password set to: {password}"
                )
            )
        elif options["reset"]:
            user.set_password(password)
            user.save()
            self.stdout.write(
                self.style.SUCCESS(
                    f"[OK] Master admin password reset to: {password}"
                )
            )
        else:
            self.stdout.write(
                self.style.WARNING(
                    f"[INFO] Master admin user already exists: {username}"
                )
            )
            self.stdout.write(
                self.style.WARNING(
                    "Use --reset flag to reset password to default"
                )
            )

        # Ensure master admin group exists
        admin_group, _ = Group.objects.get_or_create(name="admin")
        user.groups.add(admin_group)
        self.stdout.write(
            self.style.SUCCESS(
                f"[OK] Master admin assigned to 'admin' group"
            )
        )
