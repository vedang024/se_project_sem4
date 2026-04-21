import re
from collections import defaultdict
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from academicsection.models import Branch, BranchBatch, Course, CourseBatch, Department


SECTION_TO_BRANCH = {
    "B.TECH. IN COMPUTER SCIENCE AND ENGINEERING": {
        "id": "CSE",
        "name": "Computer Science and Engineering",
        "dept": "CS",
        "years": 4,
    },
    "B.TECH. IN ELECTRICAL AND ELECTRONICS ENGINEERING": {
        "id": "EEE",
        "name": "Electronics & Electrical Engineering",
        "dept": "EEE",
        "years": 4,
    },
    "B.TECH. IN MATHEMATICS AND SCIENTIFIC COMPUTING": {
        "id": "BMS",
        "name": "Mathematics & Scientific Computing",
        "dept": "ES",
        "years": 4,
    },
    "INTEGRATED POSTGRADUATE IN INFORMATION TECHNOLOGY": {
        "id": "IMT",
        "name": "Integrated M.Tech in Information Technology",
        "dept": "IT",
        "years": 5,
    },
    "INTEGRATED POSTGRADUATE IN BUSINESS ADMINISTRATION": {
        "id": "IPB",
        "name": "Integrated Programme in Business Administration",
        "dept": "MS",
        "years": 5,
    },
}

CODE_DEPT_BY_PREFIX = {
    "CS": "CS",
    "EE": "EEE",
    "ES": "ES",
    "IT": "IT",
    "MS": "MS",
}

ROMAN = {1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII", 9: "IX", 10: "X"}


def normalize_line(text):
    return re.sub(r"\s+", " ", (text or "").strip())


def guess_semesters_from_code(course_code):
    match = re.search(r"(\d{3})", course_code)
    if not match:
        return []

    number = int(match.group(1))
    level = number // 100

    if level <= 1:
        return [1, 2]
    if level == 2:
        return [3, 4]
    if level == 3:
        return [5, 6]
    if level == 4:
        return [7, 8]
    if level >= 5:
        return [9, 10]

    return []


class Command(BaseCommand):
    help = "Import branches, batches, courses and course-batch mappings from ABV-IIITM PDF"

    def add_arguments(self, parser):
        parser.add_argument("--pdf", required=True, help="Absolute or relative path to PDF file")
        parser.add_argument("--dry-run", action="store_true", help="Parse and report without writing DB changes")

    def handle(self, *args, **options):
        pdf_path = Path(options["pdf"]).expanduser().resolve()
        dry_run = options["dry_run"]

        if not pdf_path.exists():
            raise CommandError(f"PDF not found: {pdf_path}")

        try:
            import pypdf
        except Exception as exc:
            raise CommandError(f"Missing dependency pypdf: {exc}")

        reader = pypdf.PdfReader(str(pdf_path))
        rows = []
        current_branch = None

        row_pattern_code_first = re.compile(
            r"^(\d+)\.?\s+([A-Z]{2,4}\d{3}[A-Z]?)\s+(.+?)\s+(\d+)\s+\d\s*[-–]\s*\d\s*[-–]\s*\d"
        )
        row_pattern_name_first = re.compile(
            r"^(\d+)\.?\s+(.+?)\s+([A-Z]{2,4}\d{3}[A-Z]?)\s+\d\s*[-–]\s*\d\s*[-–]\s*\d\s+(\d+)$"
        )

        skip_tokens = ("TOTAL", "EXIT AFTER", "OPTIONAL", "SEMESTER", "INDEX", "UPDATED IN")

        for page in reader.pages:
            page_text = page.extract_text() or ""
            for raw_line in page_text.splitlines():
                line = normalize_line(raw_line)
                if not line:
                    continue

                upper_line = line.upper()
                if "B.TECH" in upper_line and "COMPUTER SCIENCE AND ENGINEERING" in upper_line:
                    current_branch = "CSE"
                elif "B.TECH" in upper_line and "ELECTRICAL AND ELECTRONICS ENGINEERING" in upper_line:
                    current_branch = "EEE"
                elif "B.TECH" in upper_line and "MATHEMATICS AND SCIENTIFIC COMPUTING" in upper_line:
                    current_branch = "BMS"
                elif "INTEGRATED POSTGRADUATE" in upper_line and "INFORMATION TECHNOLOGY" in upper_line:
                    current_branch = "IMT"
                elif "INTEGRATED POSTGRADUATE" in upper_line and "BUSINESS ADMINISTRATION" in upper_line:
                    current_branch = "IPB"

                if current_branch is None:
                    continue

                if any(token in upper_line for token in skip_tokens):
                    continue

                m1 = row_pattern_code_first.match(line)
                if m1:
                    course_code = m1.group(2).strip().upper()
                    course_name = normalize_line(m1.group(3))
                    credits = int(m1.group(4))
                else:
                    m2 = row_pattern_name_first.match(line)
                    if not m2:
                        continue
                    course_name = normalize_line(m2.group(2))
                    course_code = m2.group(3).strip().upper()
                    credits = int(m2.group(4))

                if "X" in course_code:
                    continue

                if len(course_name) < 3:
                    continue

                rows.append(
                    {
                        "branch_id": current_branch,
                        "course_id": course_code,
                        "course_name": course_name,
                        "credits": credits,
                    }
                )

        if not rows:
            raise CommandError("No course rows were parsed from the PDF. Check format or parser rules.")

        unique_course_rows = {}
        for row in rows:
            unique_course_rows.setdefault(row["course_id"], row)

        by_branch_rows = defaultdict(list)
        for row in rows:
            by_branch_rows[row["branch_id"]].append(row)

        parsed_count = len(rows)
        unique_courses_count = len(unique_course_rows)

        self.stdout.write(self.style.NOTICE(f"Parsed rows: {parsed_count}"))
        self.stdout.write(self.style.NOTICE(f"Unique courses: {unique_courses_count}"))
        self.stdout.write(self.style.NOTICE(f"Branches found in PDF rows: {sorted(by_branch_rows.keys())}"))

        if dry_run:
            self.stdout.write(self.style.SUCCESS("Dry run complete. No DB changes applied."))
            return

        created_departments = 0
        created_branches = 0
        created_batches = 0
        created_courses = 0
        updated_courses = 0
        linked_course_batches = 0

        with transaction.atomic():
            dept_cache = {}
            for config in SECTION_TO_BRANCH.values():
                dept_name = config["dept"]
                dept, created = Department.objects.get_or_create(dept_name=dept_name)
                dept_cache[dept_name] = dept
                if created:
                    created_departments += 1

            branch_cache = {}
            for config in SECTION_TO_BRANCH.values():
                dept = dept_cache[config["dept"]]
                branch, created = Branch.objects.get_or_create(
                    branch_id=config["id"],
                    defaults={
                        "branch_name": config["name"],
                        "department": dept,
                        "college_years": config["years"],
                    },
                )
                if not created:
                    changed = False
                    if branch.branch_name != config["name"]:
                        branch.branch_name = config["name"]
                        changed = True
                    if branch.department_id != dept.dept_id:
                        branch.department = dept
                        changed = True
                    if branch.college_years != config["years"]:
                        branch.college_years = config["years"]
                        changed = True
                    if changed:
                        branch.save(update_fields=["branch_name", "department", "college_years"])
                else:
                    created_branches += 1

                branch_cache[branch.branch_id] = branch

            batch_cache = {}
            for branch in branch_cache.values():
                max_sem = int(branch.college_years) * 2
                for sem in range(1, max_sem + 1):
                    batch_name = f"{branch.branch_id}-{ROMAN.get(sem, str(sem))}"
                    batch, created = BranchBatch.objects.get_or_create(
                        branch=branch,
                        year=sem,
                        batch_name=batch_name,
                        defaults={"college_year": (sem + 1) // 2},
                    )
                    if created:
                        created_batches += 1
                    batch_cache[(branch.branch_id, sem)] = batch

            for course_id, row in unique_course_rows.items():
                prefix = re.match(r"^[A-Z]{2,4}", course_id)
                prefix_text = prefix.group(0)[:2] if prefix else ""
                dept_name = CODE_DEPT_BY_PREFIX.get(prefix_text, SECTION_TO_BRANCH.get(next((k for k, v in SECTION_TO_BRANCH.items() if v["id"] == row["branch_id"]), ""), {}).get("dept", "CS"))
                dept = dept_cache[dept_name]

                course, created = Course.objects.get_or_create(
                    course_id=course_id,
                    defaults={
                        "course_name": row["course_name"],
                        "credits": row["credits"],
                        "department": dept,
                    },
                )
                if created:
                    created_courses += 1
                else:
                    changed = False
                    if course.course_name != row["course_name"]:
                        course.course_name = row["course_name"]
                        changed = True
                    if course.credits != row["credits"]:
                        course.credits = row["credits"]
                        changed = True
                    if course.department_id != dept.dept_id:
                        course.department = dept
                        changed = True
                    if changed:
                        course.save(update_fields=["course_name", "credits", "department"])
                        updated_courses += 1

            for branch_id, branch_rows in by_branch_rows.items():
                for row in branch_rows:
                    sem_candidates = guess_semesters_from_code(row["course_id"])
                    for sem in sem_candidates:
                        batch = batch_cache.get((branch_id, sem))
                        if batch is None:
                            continue

                        _, created = CourseBatch.objects.get_or_create(
                            batch=batch,
                            course_id=row["course_id"],
                        )
                        if created:
                            linked_course_batches += 1

        self.stdout.write(self.style.SUCCESS("Import completed successfully."))
        self.stdout.write(self.style.SUCCESS(f"Departments created: {created_departments}"))
        self.stdout.write(self.style.SUCCESS(f"Branches created: {created_branches}"))
        self.stdout.write(self.style.SUCCESS(f"Batches created: {created_batches}"))
        self.stdout.write(self.style.SUCCESS(f"Courses created: {created_courses}"))
        self.stdout.write(self.style.SUCCESS(f"Courses updated: {updated_courses}"))
        self.stdout.write(self.style.SUCCESS(f"Course-batch links created: {linked_course_batches}"))
