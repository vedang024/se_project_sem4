import re
from pathlib import Path

from django.contrib.auth.models import Group, User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from academicsection.models import Department, UserProfile
from faculty.models import Faculty


IGNORE_LINE_TOKENS = (
    "CLICK HERE TO VIEW MORE DETAILS",
    "ABV-IIITM",
    "ABV-IIITM GWALIOR",
)

DEPARTMENT_KEYWORDS = {
    "information technology": "IT",
    "management studies": "MS",
    "management": "MS",
    "computer science": "CS",
    "electrical": "EEE",
    "electronics": "EEE",
    "engineering sciences": "ES",
    "mathematics": "ES",
}


def normalize_line(text):
    return re.sub(r"\s+", " ", (text or "").strip())


def normalize_email_to_erp(raw_email):
    raw_email = (raw_email or "").strip().lower()
    if "@" not in raw_email:
        return ""
    local_part = raw_email.split("@", 1)[0]
    return f"{local_part}@erp.ac.in"


def extract_value(line, label):
    if ":" in line:
        key, value = line.split(":", 1)
        if key.strip().lower().replace(" ", "") == label:
            return normalize_line(value)
    return ""


def choose_department_name(raw_department):
    dept_text = (raw_department or "").strip().lower()
    for keyword, dept_name in DEPARTMENT_KEYWORDS.items():
        if keyword in dept_text:
            return dept_name
    if not dept_text:
        return "IT"
    return raw_department.strip()[:100]


def parse_chunks_to_records(chunks):
    records = []
    email_pattern = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

    for chunk_lines in chunks:
        lines = [normalize_line(line) for line in chunk_lines if normalize_line(line)]
        if not lines:
            continue

        field_start = 0
        for idx, line in enumerate(lines):
            lower_line = line.lower()
            if ":" in line and (
                lower_line.startswith("designation")
                or lower_line.startswith("department")
                or lower_line.startswith("honour")
                or lower_line.startswith("honor")
                or lower_line.startswith("email")
                or lower_line.startswith("phone")
                or lower_line.startswith("address")
                or lower_line.startswith("research")
            ):
                field_start = idx
                break

        name = normalize_line(" ".join(lines[:field_start])) if field_start > 0 else ""

        designation = ""
        department_raw = ""
        honor = ""
        phone = ""
        address_parts = []
        research_parts = []
        email = ""

        capture_address = False
        capture_research = False

        for line in lines[field_start:]:
            lower_line = line.lower()

            if lower_line.startswith("designation"):
                designation = extract_value(line, "designation")
                capture_address = False
                capture_research = False
                continue

            if lower_line.startswith("department"):
                department_raw = extract_value(line, "department")
                capture_address = False
                capture_research = False
                continue

            if lower_line.startswith("honour") or lower_line.startswith("honor"):
                honor = line.split(":", 1)[1].strip() if ":" in line else ""
                capture_address = False
                capture_research = False
                continue

            if lower_line.startswith("email"):
                match = email_pattern.search(line)
                if match:
                    email = normalize_email_to_erp(match.group(0))
                capture_address = False
                capture_research = False
                continue

            if lower_line.startswith("phone"):
                phone = line.split(":", 1)[1].strip() if ":" in line else ""
                capture_address = False
                capture_research = False
                continue

            if lower_line.startswith("address"):
                address_value = line.split(":", 1)[1].strip() if ":" in line else ""
                if address_value:
                    address_parts.append(address_value)
                capture_address = True
                capture_research = False
                continue

            if lower_line.startswith("research"):
                value = line.split(":", 1)[1].strip() if ":" in line else ""
                if value:
                    research_parts.append(value)
                capture_address = False
                capture_research = True
                continue

            if "click here to view more details" in lower_line:
                capture_address = False
                capture_research = False
                continue

            if capture_address:
                address_parts.append(line)
            elif capture_research:
                research_parts.append(line)

        if not email:
            continue

        if not name:
            name = email.split("@", 1)[0].replace(".", " ").title()

        records.append(
            {
                "name": name[:100],
                "email": email,
                "department_raw": department_raw,
                "designation": designation[:100],
                "honor": honor[:100],
                "phone_number": phone[:20],
                "address": normalize_line(" ".join(address_parts))[:255],
                "research_area": normalize_line(" ".join(research_parts))[:255],
            }
        )

    deduped = {}
    for record in records:
        deduped[record["email"]] = record

    return list(deduped.values())


class Command(BaseCommand):
    help = "Import faculty from a PDF using OCR and create linked user accounts"

    def add_arguments(self, parser):
        parser.add_argument("--pdf", required=True, help="Path to faculty PDF")
        parser.add_argument("--default-password", required=True, help="Default password for all imported faculty")
        parser.add_argument("--dry-run", action="store_true", help="Parse and report without writing DB")

    def handle(self, *args, **options):
        pdf_path = Path(options["pdf"]).expanduser().resolve()
        default_password = str(options["default_password"])
        dry_run = bool(options["dry_run"])

        if not pdf_path.exists():
            raise CommandError(f"PDF not found: {pdf_path}")

        if len(default_password) < 8:
            raise CommandError("--default-password must be at least 8 characters")

        try:
            from pypdfium2 import PdfDocument
            from rapidocr_onnxruntime import RapidOCR
            import numpy as np
        except Exception as exc:
            raise CommandError(f"Missing OCR dependencies: {exc}")

        pdf = PdfDocument(str(pdf_path))
        ocr = RapidOCR()

        chunks = []
        current_chunk = []

        for page_index in range(len(pdf)):
            page = pdf[page_index]
            image = page.render(scale=2).to_pil()
            result, _ = ocr(np.array(image))
            lines = [] if not result else [normalize_line(item[1]) for item in result]

            for line in lines:
                if not line:
                    continue

                upper_line = line.upper()
                if any(token in upper_line for token in IGNORE_LINE_TOKENS):
                    if "CLICK HERE TO VIEW MORE DETAILS" in upper_line and current_chunk:
                        current_chunk.append(line)
                        chunks.append(current_chunk)
                        current_chunk = []
                    continue

                current_chunk.append(line)
                if "CLICK HERE TO VIEW MORE DETAILS" in upper_line:
                    chunks.append(current_chunk)
                    current_chunk = []

        if current_chunk:
            chunks.append(current_chunk)

        records = parse_chunks_to_records(chunks)
        if not records:
            raise CommandError("No faculty records parsed from PDF. Try with a clearer PDF or CSV input.")

        self.stdout.write(self.style.NOTICE(f"Parsed faculty records: {len(records)}"))

        if dry_run:
            preview = records[:5]
            for row in preview:
                self.stdout.write(f"- {row['name']} | {row['email']} | {row['department_raw']}")
            self.stdout.write(self.style.SUCCESS("Dry run complete. No DB changes applied."))
            return

        created_users = 0
        updated_users = 0
        created_profiles = 0
        updated_profiles = 0
        created_faculty = 0
        updated_faculty = 0
        created_departments = 0

        with transaction.atomic():
            faculty_group, _ = Group.objects.get_or_create(name="faculty")

            for row in records:
                dept_name = choose_department_name(row["department_raw"])
                department, department_created = Department.objects.get_or_create(dept_name=dept_name)
                if department_created:
                    created_departments += 1

                user, user_created = User.objects.get_or_create(username=row["email"])
                user.first_name = row["name"]
                user.email = row["email"]
                user.set_password(default_password)
                user.save()
                user.groups.add(faculty_group)
                if user_created:
                    created_users += 1
                else:
                    updated_users += 1

                profile, profile_created = UserProfile.objects.get_or_create(user=user)
                profile.role = "faculty"
                profile.department = department
                profile.branch = None
                profile.batch = None
                profile.roll_no = None
                profile.save()
                if profile_created:
                    created_profiles += 1
                else:
                    updated_profiles += 1

                faculty_obj, faculty_created = Faculty.objects.get_or_create(
                    email=row["email"],
                    defaults={
                        "name": row["name"],
                        "department": department,
                    },
                )
                faculty_obj.name = row["name"]
                faculty_obj.department = department
                faculty_obj.designation = row["designation"]
                faculty_obj.honor = row["honor"]
                faculty_obj.phone_number = row["phone_number"]
                faculty_obj.research_area = row["research_area"]
                faculty_obj.address = row["address"]
                faculty_obj.save()
                if faculty_created:
                    created_faculty += 1
                else:
                    updated_faculty += 1

        self.stdout.write(self.style.SUCCESS("Faculty import completed."))
        self.stdout.write(self.style.SUCCESS(f"Departments created: {created_departments}"))
        self.stdout.write(self.style.SUCCESS(f"Users created: {created_users}"))
        self.stdout.write(self.style.SUCCESS(f"Users updated: {updated_users}"))
        self.stdout.write(self.style.SUCCESS(f"Profiles created: {created_profiles}"))
        self.stdout.write(self.style.SUCCESS(f"Profiles updated: {updated_profiles}"))
        self.stdout.write(self.style.SUCCESS(f"Faculty rows created: {created_faculty}"))
        self.stdout.write(self.style.SUCCESS(f"Faculty rows updated: {updated_faculty}"))
