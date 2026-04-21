from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth.models import User, Group
from academicsection.models import UserProfile


class Command(BaseCommand):
    help = "Manage admin users - add, remove, list admins"

    def add_arguments(self, parser):
        parser.add_argument(
            "action",
            type=str,
            choices=["add", "remove", "list", "reset-password"],
            help="Action to perform: add/remove/list/reset-password",
        )
        parser.add_argument(
            "--email",
            type=str,
            help="Admin email (username) - required for add/remove/reset-password",
        )
        parser.add_argument(
            "--password",
            type=str,
            help="Password for new admin (optional, auto-generated if not provided)",
        )
        parser.add_argument(
            "--department",
            type=str,
            help="Department ID for admin (optional, for add action)",
        )

    def handle(self, *args, **options):
        action = options["action"]

        if action == "list":
            self.list_admins()
        elif action == "add":
            email = options.get("email")
            if not email:
                raise CommandError("--email is required for add action")
            password = options.get("password", "Admin@123")
            department_id = options.get("department")
            self.add_admin(email, password, department_id)
        elif action == "remove":
            email = options.get("email")
            if not email:
                raise CommandError("--email is required for remove action")
            self.remove_admin(email)
        elif action == "reset-password":
            email = options.get("email")
            if not email:
                raise CommandError("--email is required for reset-password action")
            password = options.get("password", "Admin@123")
            self.reset_admin_password(email, password)

    def list_admins(self):
        admin_group = Group.objects.filter(name="admin").first()
        if not admin_group:
            self.stdout.write(self.style.WARNING("No admin group found"))
            return

        admins = admin_group.user_set.all()
        if not admins.exists():
            self.stdout.write(self.style.WARNING("No admins found"))
            return

        self.stdout.write(self.style.SUCCESS("\n=== List of Admins ===\n"))
        for user in admins:
            profile = UserProfile.objects.filter(user=user).first()
            dept = ""
            if profile and profile.department:
                dept = f" | Department: {profile.department.dept_name}"
            self.stdout.write(
                f"  * {user.username}{dept}\n"
            )
        self.stdout.write(self.style.SUCCESS(f"\nTotal: {admins.count()} admin(s)\n"))

    def add_admin(self, email, password, department_id=None):
        email = str(email).strip().lower()
        if not email.endswith("@erp.ac.in"):
            email = email.split("@")[0] + "@erp.ac.in"

        user, created = User.objects.get_or_create(
            username=email,
            defaults={
                "email": email,
                "is_staff": False,
                "is_superuser": False,
                "is_active": True,
            },
        )

        if not created:
            self.stdout.write(
                self.style.WARNING(
                    f"[WARNING] Admin user already exists: {email}"
                )
            )
        else:
            user.set_password(password)
            user.save()
            self.stdout.write(
                self.style.SUCCESS(
                    f"[OK] Admin user created: {email}"
                )
            )
            self.stdout.write(
                self.style.SUCCESS(
                    f"[OK] Password: {password}"
                )
            )

        # Add to admin group
        admin_group, _ = Group.objects.get_or_create(name="admin")
        user.groups.add(admin_group)

        # Create or update UserProfile
        profile, profile_created = UserProfile.objects.get_or_create(
            user=user,
            defaults={
                "roll_no": email,
                "role": "admin",
            },
        )

        if department_id:
            from academicsection.models import Department
            try:
                department = Department.objects.get(id=department_id)
                profile.department = department
                profile.save()
                self.stdout.write(
                    self.style.SUCCESS(
                        f"[OK] Admin assigned to department: {department.dept_name}"
                    )
                )
            except Department.DoesNotExist:
                self.stdout.write(
                    self.style.WARNING(
                        f"[WARNING] Department {department_id} not found"
                    )
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"\n[OK] Admin setup complete: {email}\n"
            )
        )

    def remove_admin(self, email):
        email = str(email).strip().lower()
        if not email.endswith("@erp.ac.in"):
            email = email.split("@")[0] + "@erp.ac.in"

        try:
            user = User.objects.get(username=email)
            admin_group = Group.objects.filter(name="admin").first()
            if admin_group:
                user.groups.remove(admin_group)
            user.delete()
            self.stdout.write(
                self.style.SUCCESS(
                    f"[OK] Admin removed: {email}\n"
                )
            )
        except User.DoesNotExist:
            raise CommandError(f"Admin user not found: {email}")

    def reset_admin_password(self, email, password):
        email = str(email).strip().lower()
        if not email.endswith("@erp.ac.in"):
            email = email.split("@")[0] + "@erp.ac.in"

        try:
            user = User.objects.get(username=email)
            user.set_password(password)
            user.save()
            self.stdout.write(
                self.style.SUCCESS(
                    f"[OK] Password reset for: {email}"
                )
            )
            self.stdout.write(
                self.style.SUCCESS(
                    f"[OK] New password: {password}\n"
                )
            )
        except User.DoesNotExist:
            raise CommandError(f"Admin user not found: {email}")
