import json
import re
from datetime import date as date_class
from datetime import datetime

from django.contrib.auth import authenticate
from django.contrib.auth.models import Group, User
from django.db import connection
from django.db import transaction
from django.db.models import Count, Q
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from academicsection.models import Branch, BranchBatch, Course, CourseBatch, Department, Friday, Monday, Saturday, SharedTimetable, Thursday, Tuesday, UserProfile, Wednesday
from faculty.models import Attendance, Faculty
from student.models import Application, Student, StudentCourse


VALID_ROLES = {"student", "faculty", "admin"}
ROMAN_SEMESTERS = {
    1: "I",
    2: "II",
    3: "III",
    4: "IV",
    5: "V",
    6: "VI",
    7: "VII",
    8: "VIII",
}

GRADE_POINTS_MAP = {
    "O": 10.0,
    "A+": 10.0,
    "A": 9.0,
    "A-": 8.5,
    "B+": 8.0,
    "B": 7.0,
    "B-": 6.5,
    "C+": 6.0,
    "C": 5.0,
    "P": 4.0,
    "F": 0.0,
    "FF": 0.0,
}


def cors_response(payload, status=200):
    response = JsonResponse(payload, status=status)
    response["Access-Control-Allow-Origin"] = "*"
    response["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response["Access-Control-Allow-Headers"] = "Content-Type"
    return response


def normalize_role(role):
    role = str(role).strip().lower()
    if role == "academic":
        return "admin"
    return role


def user_has_role(user, role):
    if role == "admin":
        return user.groups.filter(name__in=["admin", "academic"]).exists() or user.is_superuser
    return user.groups.filter(name=role).exists() or user.is_superuser


def parse_admin_credentials(payload):
    admin_username = normalize_erp_email(payload.get("admin_username", ""))
    admin_password = str(payload.get("admin_password", ""))
    raw_username = str(payload.get("admin_username", "")).strip()
    return admin_username, admin_password, raw_username


def get_authenticated_admin(payload):
    admin_username, admin_password, raw_username = parse_admin_credentials(payload)

    if not admin_username or not admin_password:
        return None

    admin_user = authenticate(username=admin_username, password=admin_password)
    if admin_user is None and raw_username and raw_username != admin_username:
        # Fallback for legacy usernames with case variance.
        admin_user = authenticate(username=raw_username, password=admin_password)

    if admin_user is None or not user_has_role(admin_user, "admin"):
        return None

    return admin_user


def validate_admin_or_403(payload):
    if get_authenticated_admin(payload) is None:
        return cors_response({"success": False, "message": "Admin authentication required."}, status=403)
    return None


def normalize_erp_email(value):
    email = str(value or "").strip().lower()
    if email.endswith("@iiitm.ac.in"):
        local_part = email.split("@", 1)[0]
        return f"{local_part}@erp.ac.in"
    return email


def semester_to_roman(semester):
    return ROMAN_SEMESTERS.get(int(semester), "")


def parse_iso_date(value):
    value_str = str(value or "").strip()
    if not value_str:
        raise ValueError("Date is required in YYYY-MM-DD format.")

    try:
        return datetime.strptime(value_str, "%Y-%m-%d").date()
    except ValueError as error:
        raise ValueError("Date must be in YYYY-MM-DD format.") from error


def grade_to_points(grade):
    grade_key = str(grade or "").strip().upper()
    if not grade_key or grade_key == "-":
        return None
    return GRADE_POINTS_MAP.get(grade_key)


def parse_semester_value(value):
    if isinstance(value, int):
        return value

    value_str = str(value or "").strip().upper()
    if not value_str:
        raise ValueError("Semester is required.")

    if value_str.isdigit():
        return int(value_str)

    roman_to_number = {roman: number for number, roman in ROMAN_SEMESTERS.items()}
    if value_str in roman_to_number:
        return roman_to_number[value_str]

    raise ValueError("Semester must be a number or roman numeral (I-VIII).")


def get_batch_display_name(branch_code, semester):
    return f"{str(branch_code).upper()}-{semester_to_roman(semester)}"


def extract_branch_code_from_identifier(identifier):
    local_part = str(identifier or "").strip().split("@", 1)[0]
    match = re.match(r"^([a-zA-Z]+)", local_part)
    if not match:
        return ""
    return match.group(1).upper()


def resolve_student_department_branch(username, department_id, branch_id):
    inferred_branch_code = extract_branch_code_from_identifier(username)
    if inferred_branch_code:
        inferred_branch = Branch.objects.select_related("department").filter(branch_id__iexact=inferred_branch_code).first()
        if inferred_branch:
            return inferred_branch.department, inferred_branch

    if department_id is None or branch_id is None:
        raise ValueError("Department and branch are required for student.")

    try:
        department = Department.objects.get(pk=department_id)
        branch = Branch.objects.get(pk=branch_id)
    except (Department.DoesNotExist, Branch.DoesNotExist):
        raise ValueError("Invalid department or branch selected.")

    if branch.department_id != department.dept_id:
        raise ValueError("Selected branch does not belong to the department.")

    return department, branch


def resolve_student_batch(branch, batch_id):
    if batch_id:
        try:
            batch = BranchBatch.objects.get(pk=batch_id)
        except BranchBatch.DoesNotExist:
            raise ValueError("Invalid batch selected.")

        if batch.branch_id != branch.branch_id:
            raise ValueError("Selected batch does not belong to the selected branch.")

        return batch

    return BranchBatch.objects.filter(branch=branch).order_by("year", "batch_name").first()


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def login_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    raw_username = str(payload.get("username", "")).strip()
    username = normalize_erp_email(raw_username)
    password = str(payload.get("password", ""))
    role = normalize_role(payload.get("role", ""))

    if not username or not password:
        return cors_response({"success": False, "message": "Username and password are required."}, status=400)

    if role not in VALID_ROLES:
        return cors_response({"success": False, "message": "Invalid role selected."}, status=400)

    user = authenticate(request, username=username, password=password)
    if user is None and raw_username and raw_username != username:
        user = authenticate(request, username=raw_username, password=password)

    if user is None:
        return cors_response({"success": False, "message": "Invalid credentials."}, status=401)

    if not user_has_role(user, role):
        return cors_response({"success": False, "message": "You are not assigned to this role."}, status=403)

    profile = UserProfile.objects.select_related("department", "branch", "batch").filter(user=user).first()

    return cors_response(
        {
            "success": True,
            "message": "Login successful.",
            "user": {
                "id": user.id,
                "username": user.username,
                "full_name": user.first_name,
                "email": user.email,
                "role": role,
                "department_id": profile.department.dept_id if profile and profile.department else None,
                "department": profile.department.dept_name if profile and profile.department else None,
                "branch_id": profile.branch.branch_id if profile and profile.branch else None,
                "branch": profile.branch.branch_name if profile and profile.branch else None,
                "batch_id": profile.batch.id if profile and profile.batch else None,
                "batch": profile.batch.batch_name if profile and profile.batch else None,
                "roll_no": profile.roll_no if profile else None,
            },
        }
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def create_user_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    username = str(payload.get("username", "")).strip()
    full_name = str(payload.get("full_name", "")).strip()
    roll_no = str(payload.get("roll_no", "")).strip().upper()
    email = normalize_erp_email(payload.get("email", ""))
    password = str(payload.get("password", ""))
    confirm_password = str(payload.get("confirm_password", ""))
    role = normalize_role(payload.get("role", ""))
    department_id = payload.get("department_id")
    branch_id = payload.get("branch_id")
    batch_id = payload.get("batch_id")
    faculty_name = str(payload.get("faculty_name", "")).strip()
    faculty_email = normalize_erp_email(payload.get("faculty_email", ""))
    faculty_designation = str(payload.get("faculty_designation", "")).strip()
    faculty_honor = str(payload.get("faculty_honor", "")).strip()
    faculty_experience = str(payload.get("faculty_experience", "")).strip()
    faculty_phone_number = str(payload.get("faculty_phone_number", "")).strip()
    faculty_research_area = str(payload.get("faculty_research_area", "")).strip()
    faculty_address = str(payload.get("faculty_address", "")).strip()

    auth_error = validate_admin_or_403(payload)
    if auth_error:
        return auth_error

    if role == "student":
        username = email

    if role == "faculty":
        faculty_email = faculty_email or normalize_erp_email(username)
        username = faculty_email

    if not username or not password or not confirm_password or not role:
        return cors_response({"success": False, "message": "All fields are required."}, status=400)

    if role not in VALID_ROLES:
        return cors_response({"success": False, "message": "Invalid role selected."}, status=400)

    if len(password) < 8:
        return cors_response({"success": False, "message": "Password must be at least 8 characters."}, status=400)

    if password != confirm_password:
        return cors_response({"success": False, "message": "Passwords do not match."}, status=400)

    if User.objects.filter(username=username).exists():
        return cors_response({"success": False, "message": "Username already exists."}, status=409)

    department = None
    branch = None
    batch = None
    profile_roll_no = None
    if role == "student":
        if not full_name or not roll_no or not email:
            return cors_response({"success": False, "message": "Name, roll number, and email are required for student."}, status=400)

        if "@" not in email:
            return cors_response({"success": False, "message": "Valid email is required for student."}, status=400)

        try:
            department, branch = resolve_student_department_branch(username, department_id, branch_id)
            batch = resolve_student_batch(branch, batch_id)
        except ValueError as error:
            return cors_response({"success": False, "message": str(error)}, status=400)

        profile_roll_no = roll_no

    if role == "faculty":
        if department_id is None:
            return cors_response({"success": False, "message": "Department is required for faculty."}, status=400)

        try:
            department = Department.objects.get(pk=department_id)
        except Department.DoesNotExist:
            return cors_response({"success": False, "message": "Invalid department selected."}, status=400)

        if not faculty_name:
            faculty_name = username

        if not faculty_email and "@" in username:
            faculty_email = normalize_erp_email(username)

        if not faculty_email:
            return cors_response({"success": False, "message": "Faculty email is required for faculty user."}, status=400)

    with transaction.atomic():
        user = User.objects.create_user(username=username, password=password)
        role_group, _ = Group.objects.get_or_create(name=role)
        user.groups.add(role_group)

        if role == "student":
            user.first_name = full_name
            user.email = email
            user.save(update_fields=["first_name", "email"])

        if role == "faculty":
            user.first_name = faculty_name
            user.email = faculty_email
            user.save(update_fields=["first_name", "email"])

        UserProfile.objects.update_or_create(
            user=user,
            defaults={
                "role": role,
                "roll_no": profile_roll_no,
                "department": department,
                "branch": branch,
                "batch": batch if role == "student" else None,
            },
        )

        if role == "faculty":
            faculty_record = Faculty.objects.filter(email__iexact=faculty_email).first()
            if faculty_record:
                faculty_record.name = faculty_name
                faculty_record.department = department
                faculty_record.email = faculty_email
                faculty_record.designation = faculty_designation
                faculty_record.honor = faculty_honor
                faculty_record.experience = faculty_experience
                faculty_record.phone_number = faculty_phone_number
                faculty_record.research_area = faculty_research_area
                faculty_record.address = faculty_address
                faculty_record.save(update_fields=["name", "department", "email", "designation", "honor", "experience", "phone_number", "research_area", "address"])
            else:
                Faculty.objects.create(
                    name=faculty_name,
                    email=faculty_email,
                    department=department,
                    designation=faculty_designation,
                    honor=faculty_honor,
                    experience=faculty_experience,
                    phone_number=faculty_phone_number,
                    research_area=faculty_research_area,
                    address=faculty_address,
                )

    return cors_response(
        {
            "success": True,
            "message": f"{role.title()} user created successfully.",
            "user": {
                "id": user.id,
                "username": user.username,
                "full_name": user.first_name,
                "email": user.email,
                "roll_no": profile_roll_no,
                "role": role,
                "department": department.dept_name if department else None,
                "branch": branch.branch_name if branch else None,
                "batch": batch.batch_name if batch else None,
            },
        },
        status=201,
    )


@csrf_exempt
@require_http_methods(["GET", "OPTIONS"])
def list_departments_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    departments = Department.objects.select_related("hod").annotate(
        faculty_count=Count("faculty", distinct=True),
        course_count=Count("course", distinct=True),
    ).order_by("dept_name")

    return cors_response(
        {
            "success": True,
            "departments": [
                {
                    "id": dept.dept_id,
                    "name": dept.dept_name,
                    "hod_id": dept.hod.faculty_id if dept.hod else None,
                    "hod_name": dept.hod.name if dept.hod else "Not Assigned",
                    "faculty_count": dept.faculty_count,
                    "course_count": dept.course_count,
                }
                for dept in departments
            ],
        }
    )


@csrf_exempt
@require_http_methods(["GET", "OPTIONS"])
def faculty_options_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    faculty = Faculty.objects.select_related("department").order_by("name")
    return cors_response(
        {
            "success": True,
            "faculty": [
                {
                    "id": f.faculty_id,
                    "name": f.name,
                    "department_id": f.department_id,
                    "department_name": f.department.dept_name if f.department else "-",
                }
                for f in faculty
            ],
        }
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def create_department_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    auth_error = validate_admin_or_403(payload)
    if auth_error:
        return auth_error

    department_name = str(payload.get("department_name", "")).strip()
    hod_id = payload.get("hod_id")

    if not department_name:
        return cors_response({"success": False, "message": "Department name is required."}, status=400)

    if Department.objects.filter(dept_name__iexact=department_name).exists():
        return cors_response({"success": False, "message": "Department already exists."}, status=409)

    hod = None
    if hod_id:
        try:
            hod = Faculty.objects.get(pk=hod_id)
        except Faculty.DoesNotExist:
            return cors_response({"success": False, "message": "Selected HOD is invalid."}, status=400)

    Department.objects.create(dept_name=department_name, hod=hod)
    return cors_response({"success": True, "message": "Department created successfully."}, status=201)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def create_department_faculty_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    auth_error = validate_admin_or_403(payload)
    if auth_error:
        return auth_error

    return cors_response(
        {
            "success": False,
            "message": "Add faculty from Manage Users only.",
        },
        status=403,
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def create_department_course_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    auth_error = validate_admin_or_403(payload)
    if auth_error:
        return auth_error

    department_id = payload.get("department_id")
    course_id = str(payload.get("course_id", "")).strip().upper()
    course_name = str(payload.get("course_name", "")).strip()
    credits = payload.get("credits")

    if not department_id or not course_id or not course_name or credits is None:
        return cors_response({"success": False, "message": "Department, course code, course name, and credits are required."}, status=400)

    try:
        credits = int(credits)
    except (TypeError, ValueError):
        return cors_response({"success": False, "message": "Credits must be a number."}, status=400)

    if credits < 1 or credits > 10:
        return cors_response({"success": False, "message": "Credits must be between 1 and 10."}, status=400)

    if Course.objects.filter(course_id=course_id).exists():
        return cors_response({"success": False, "message": "Course code already exists."}, status=409)

    try:
        department = Department.objects.get(pk=department_id)
    except Department.DoesNotExist:
        return cors_response({"success": False, "message": "Department not found."}, status=404)

    course = Course.objects.create(course_id=course_id, course_name=course_name, credits=credits, department=department)
    return cors_response(
        {
            "success": True,
            "message": "Course added successfully.",
            "course": {
                "id": course.course_id,
                "name": course.course_name,
                "credits": course.credits,
            },
        },
        status=201,
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def update_department_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    auth_error = validate_admin_or_403(payload)
    if auth_error:
        return auth_error

    department_id = payload.get("department_id")
    department_name = str(payload.get("department_name", "")).strip()
    hod_id = payload.get("hod_id")

    if not department_id or not department_name:
        return cors_response({"success": False, "message": "Department id and name are required."}, status=400)

    try:
        department = Department.objects.get(pk=department_id)
    except Department.DoesNotExist:
        return cors_response({"success": False, "message": "Department not found."}, status=404)

    duplicate = Department.objects.filter(dept_name__iexact=department_name).exclude(pk=department_id).exists()
    if duplicate:
        return cors_response({"success": False, "message": "Another department already has this name."}, status=409)

    hod = None
    if hod_id:
        try:
            hod = Faculty.objects.get(pk=hod_id)
        except Faculty.DoesNotExist:
            return cors_response({"success": False, "message": "Selected HOD is invalid."}, status=400)

    department.dept_name = department_name
    department.hod = hod
    department.save()
    return cors_response({"success": True, "message": "Department updated successfully."})


@csrf_exempt
@require_http_methods(["GET", "OPTIONS"])
def get_department_detail_api(request, department_id):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        department = Department.objects.select_related("hod").annotate(
            faculty_count=Count("faculty", distinct=True),
            course_count=Count("course", distinct=True),
        ).get(pk=department_id)
    except Department.DoesNotExist:
        return cors_response({"success": False, "message": "Department not found."}, status=404)

    branches = []
    for branch in Branch.objects.filter(department=department).order_by("branch_name"):
        batches = [
            {
                "id": batch.id,
                "semester": batch.year,
                "semester_roman": semester_to_roman(batch.year),
                "college_year": batch.college_year,
                "batch_name": get_batch_display_name(branch.branch_id, batch.year),
            }
            for batch in BranchBatch.objects.filter(branch=branch).order_by("year", "batch_name")
        ]
        branches.append(
            {
                "id": branch.branch_id,
                "name": branch.branch_name,
                "college_years": branch.college_years,
                "batches": batches,
            }
        )

    faculty_members = [
        {
            "id": faculty.faculty_id,
            "name": faculty.name,
            "email": faculty.email,
        }
        for faculty in Faculty.objects.filter(department=department).order_by("name")
    ]

    courses = [
        {
            "id": course.course_id,
            "name": course.course_name,
            "credits": course.credits,
        }
        for course in Course.objects.filter(department=department).order_by("course_name")
    ]

    return cors_response(
        {
            "success": True,
            "department": {
                "id": department.dept_id,
                "name": department.dept_name,
                "hod_id": department.hod.faculty_id if department.hod else None,
                "hod_name": department.hod.name if department.hod else "Not Assigned",
                "faculty_count": department.faculty_count,
                "course_count": department.course_count,
                "branches": branches,
                "faculty_members": faculty_members,
                "courses": courses,
            },
        }
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def create_branch_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    auth_error = validate_admin_or_403(payload)
    if auth_error:
        return auth_error

    department_id = payload.get("department_id")
    branch_id = str(payload.get("branch_id", "")).strip()
    branch_name = str(payload.get("branch_name", "")).strip()
    college_years = payload.get("college_years")

    if not department_id or not branch_id or not branch_name or college_years is None:
        return cors_response({"success": False, "message": "Department, branch code, branch name, and college years are required."}, status=400)

    try:
        college_years = int(college_years)
    except (TypeError, ValueError):
        return cors_response({"success": False, "message": "College years must be a number."}, status=400)

    if college_years < 1 or college_years > 5:
        return cors_response({"success": False, "message": "College years must be between 1 and 5."}, status=400)

    if Branch.objects.filter(branch_id=branch_id).exists():
        return cors_response({"success": False, "message": "Branch code already exists."}, status=409)

    try:
        department = Department.objects.get(pk=department_id)
    except Department.DoesNotExist:
        return cors_response({"success": False, "message": "Department not found."}, status=404)

    Branch.objects.create(branch_id=branch_id, branch_name=branch_name, college_years=college_years, department=department)
    return cors_response({"success": True, "message": "Branch added successfully."}, status=201)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def update_branch_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    auth_error = validate_admin_or_403(payload)
    if auth_error:
        return auth_error

    old_branch_id = str(payload.get("old_branch_id", "")).strip()
    branch_id = str(payload.get("branch_id", "")).strip().upper()
    branch_name = str(payload.get("branch_name", "")).strip()
    college_years = payload.get("college_years")

    if not old_branch_id:
        old_branch_id = branch_id

    if not old_branch_id or not branch_id or not branch_name or college_years is None:
        return cors_response({"success": False, "message": "Branch code, branch name, and college years are required."}, status=400)

    try:
        college_years = int(college_years)
    except (TypeError, ValueError):
        return cors_response({"success": False, "message": "College years must be a number."}, status=400)

    if college_years < 1 or college_years > 4:
        return cors_response({"success": False, "message": "College years must be between 1 and 4."}, status=400)

    try:
        branch = Branch.objects.get(pk=old_branch_id)
    except Branch.DoesNotExist:
        return cors_response({"success": False, "message": "Branch not found."}, status=404)

    if branch_id != old_branch_id and Branch.objects.filter(pk=branch_id).exists():
        return cors_response({"success": False, "message": "Branch code already exists."}, status=409)

    with transaction.atomic():
        if branch_id != old_branch_id:
            with connection.cursor() as cursor:
                cursor.execute("SET FOREIGN_KEY_CHECKS=0")

            try:
                Branch.objects.filter(pk=old_branch_id).update(branch_id=branch_id)
                for model in (BranchBatch, UserProfile, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday):
                    model.objects.filter(branch_id=old_branch_id).update(branch_id=branch_id)
            finally:
                with connection.cursor() as cursor:
                    cursor.execute("SET FOREIGN_KEY_CHECKS=1")

            branch = Branch.objects.get(pk=branch_id)

        branch.branch_name = branch_name
        branch.college_years = college_years
        branch.save()
    return cors_response({"success": True, "message": "Branch updated successfully."})


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def create_branch_batch_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    auth_error = validate_admin_or_403(payload)
    if auth_error:
        return auth_error

    branch_id = str(payload.get("branch_id", "")).strip()
    semester = payload.get("semester")
    college_year = payload.get("college_year")

    if not branch_id or semester is None or college_year is None:
        return cors_response({"success": False, "message": "Branch, semester, and college year are required."}, status=400)

    try:
        semester = parse_semester_value(semester)
    except ValueError as error:
        return cors_response({"success": False, "message": str(error)}, status=400)

    try:
        college_year = int(college_year)
    except (TypeError, ValueError):
        return cors_response({"success": False, "message": "College year must be a number."}, status=400)

    if semester < 1 or semester > 8:
        return cors_response({"success": False, "message": "Semester must be between 1 and 8."}, status=400)

    if college_year < 1 or college_year > 5:
        return cors_response({"success": False, "message": "College year must be between 1 and 5."}, status=400)

    try:
        branch = Branch.objects.get(pk=branch_id)
    except Branch.DoesNotExist:
        return cors_response({"success": False, "message": "Branch not found."}, status=404)

    batch_name = get_batch_display_name(branch.branch_id, semester)

    if BranchBatch.objects.filter(branch=branch, year=semester, batch_name__iexact=batch_name).exists():
        return cors_response({"success": False, "message": "This batch already exists for the selected semester."}, status=409)

    BranchBatch.objects.create(branch=branch, year=semester, college_year=college_year, batch_name=batch_name)
    return cors_response({"success": True, "message": "Batch added successfully."}, status=201)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def update_branch_batch_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    auth_error = validate_admin_or_403(payload)
    if auth_error:
        return auth_error

    batch_id = payload.get("batch_id")
    semester = payload.get("semester")
    college_year = payload.get("college_year")

    if not batch_id or semester is None or college_year is None:
        return cors_response({"success": False, "message": "Batch id, semester, and college year are required."}, status=400)

    try:
        semester = parse_semester_value(semester)
    except ValueError as error:
        return cors_response({"success": False, "message": str(error)}, status=400)

    try:
        college_year = int(college_year)
    except (TypeError, ValueError):
        return cors_response({"success": False, "message": "College year must be a number."}, status=400)

    if semester < 1 or semester > 8:
        return cors_response({"success": False, "message": "Semester must be between 1 and 8."}, status=400)

    if college_year < 1 or college_year > 5:
        return cors_response({"success": False, "message": "College year must be between 1 and 5."}, status=400)

    try:
        batch = BranchBatch.objects.select_related("branch").get(pk=batch_id)
    except BranchBatch.DoesNotExist:
        return cors_response({"success": False, "message": "Batch not found."}, status=404)

    batch_name = get_batch_display_name(batch.branch.branch_id, semester)

    duplicate = BranchBatch.objects.filter(
        branch=batch.branch,
        year=semester,
        batch_name__iexact=batch_name,
    ).exclude(pk=batch_id).exists()
    if duplicate:
        return cors_response({"success": False, "message": "Another batch already exists with same semester."}, status=409)

    batch.year = semester
    batch.college_year = college_year
    batch.batch_name = batch_name
    batch.save()
    return cors_response({"success": True, "message": "Batch updated successfully."})


@csrf_exempt
@require_http_methods(["GET", "OPTIONS"])
def list_branch_batches_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    batches = BranchBatch.objects.select_related("branch__department").order_by("branch__department__dept_name", "branch__branch_name", "year", "batch_name")
    return cors_response(
        {
            "success": True,
            "batches": [
                {
                    "id": batch.id,
                    "semester": batch.year,
                    "semester_roman": semester_to_roman(batch.year),
                    "college_year": batch.college_year,
                    "batch_name": get_batch_display_name(batch.branch.branch_id, batch.year),
                    "branch_id": batch.branch.branch_id,
                    "branch_name": batch.branch.branch_name,
                    "department_id": batch.branch.department.dept_id,
                    "department_name": batch.branch.department.dept_name,
                    "label": f"{batch.branch.department.dept_name} / {batch.branch.branch_name} / Semester {semester_to_roman(batch.year)} / Year {batch.college_year} / {get_batch_display_name(batch.branch.branch_id, batch.year)}",
                }
                for batch in batches
            ],
        }
    )


@csrf_exempt
@require_http_methods(["GET", "OPTIONS"])
def get_branch_batch_detail_api(request, batch_id):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        batch = BranchBatch.objects.select_related("branch__department").get(pk=batch_id)
    except BranchBatch.DoesNotExist:
        return cors_response({"success": False, "message": "Batch not found."}, status=404)

    return cors_response(
        {
            "success": True,
            "batch": {
                "id": batch.id,
                "semester": batch.year,
                "semester_roman": semester_to_roman(batch.year),
                "college_year": batch.college_year,
                "batch_name": get_batch_display_name(batch.branch.branch_id, batch.year),
                "branch_id": batch.branch.branch_id,
                "branch_name": batch.branch.branch_name,
                "department_id": batch.branch.department.dept_id,
                "department_name": batch.branch.department.dept_name,
                "label": f"{batch.branch.department.dept_name} / {batch.branch.branch_name} / Semester {semester_to_roman(batch.year)} / Year {batch.college_year} / {get_batch_display_name(batch.branch.branch_id, batch.year)}",
            },
        }
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def delete_branch_batch_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    auth_error = validate_admin_or_403(payload)
    if auth_error:
        return auth_error

    batch_id = payload.get("batch_id")
    if not batch_id:
        return cors_response({"success": False, "message": "Batch id is required."}, status=400)

    try:
        batch = BranchBatch.objects.select_related("branch").get(pk=batch_id)
    except BranchBatch.DoesNotExist:
        return cors_response({"success": False, "message": "Batch not found."}, status=404)

    deleted_batch_id = str(batch.id)
    timetable_record = SharedTimetable.objects.order_by("-updated_at").first()

    with transaction.atomic():
        if timetable_record and isinstance(timetable_record.data, dict):
            timetable_data = timetable_record.data.get("timetableData", {})
            batches = timetable_record.data.get("batches", [])

            if isinstance(batches, list):
                timetable_record.data["batches"] = [
                    item for item in batches
                    if str(item.get("id") or item.get("branch_batch_id") or "") != deleted_batch_id
                ]

            if isinstance(timetable_data, dict):
                for day_data in timetable_data.values():
                    if isinstance(day_data, dict):
                        day_data.pop(deleted_batch_id, None)

            timetable_record.save()

        batch.delete()

    return cors_response({"success": True, "message": "Batch deleted successfully."})


@csrf_exempt
@require_http_methods(["GET", "OPTIONS"])
def get_departments_branches_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    departments = []
    for dept in Department.objects.all().order_by("dept_name"):
        branches = [
            {
                "id": branch.branch_id,
                "name": branch.branch_name,
            }
            for branch in Branch.objects.filter(department=dept).order_by("branch_name")
        ]
        departments.append(
            {
                "id": dept.dept_id,
                "name": dept.dept_name,
                "branches": branches,
            }
        )

    return cors_response({"success": True, "departments": departments})


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def list_managed_users_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    auth_error = validate_admin_or_403(payload)
    if auth_error:
        return auth_error

    role_filter = normalize_role(payload.get("role", ""))
    valid_filters = {"", "student", "faculty"}
    if role_filter not in valid_filters:
        return cors_response({"success": False, "message": "Invalid role filter."}, status=400)

    queryset = UserProfile.objects.select_related("user", "department", "branch", "batch").filter(role__in=["student", "faculty"])
    if role_filter:
        queryset = queryset.filter(role=role_filter)

    faculty_by_email = {
        (faculty.email or "").lower(): faculty
        for faculty in Faculty.objects.select_related("department").all()
    }

    users = [
        {
            "id": profile.user.id,
            "username": profile.user.username,
            "full_name": profile.user.first_name,
            "email": profile.user.email,
            "roll_no": profile.roll_no,
            "role": profile.role,
            "department_id": profile.department.dept_id if profile.department else None,
            "department": profile.department.dept_name if profile.department else "-",
            "branch_id": profile.branch.branch_id if profile.branch else None,
            "branch": profile.branch.branch_name if profile.branch else "-",
            "batch_id": profile.batch.id if profile.batch else None,
            "batch": profile.batch.batch_name if profile.batch else "-",
            "faculty_designation": faculty_by_email.get((profile.user.email or "").lower()).designation if profile.role == "faculty" and faculty_by_email.get((profile.user.email or "").lower()) else "",
            "faculty_honor": faculty_by_email.get((profile.user.email or "").lower()).honor if profile.role == "faculty" and faculty_by_email.get((profile.user.email or "").lower()) else "",
            "faculty_experience": faculty_by_email.get((profile.user.email or "").lower()).experience if profile.role == "faculty" and faculty_by_email.get((profile.user.email or "").lower()) else "",
            "faculty_phone_number": faculty_by_email.get((profile.user.email or "").lower()).phone_number if profile.role == "faculty" and faculty_by_email.get((profile.user.email or "").lower()) else "",
            "faculty_research_area": faculty_by_email.get((profile.user.email or "").lower()).research_area if profile.role == "faculty" and faculty_by_email.get((profile.user.email or "").lower()) else "",
            "faculty_address": faculty_by_email.get((profile.user.email or "").lower()).address if profile.role == "faculty" and faculty_by_email.get((profile.user.email or "").lower()) else "",
        }
        for profile in queryset.order_by("role", "user__username")
    ]

    return cors_response({"success": True, "users": users})


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def get_managed_user_detail_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    auth_error = validate_admin_or_403(payload)
    if auth_error:
        return auth_error

    user_id = payload.get("user_id")
    if not user_id:
        return cors_response({"success": False, "message": "User id is required."}, status=400)

    profile = UserProfile.objects.select_related("user", "department", "branch", "batch").filter(user_id=user_id).first()
    if profile is None:
        return cors_response({"success": False, "message": "User not found."}, status=404)

    marks_and_grades = []
    faculty_info = None
    if profile.role == "student" and profile.roll_no:
        student_record = Student.objects.filter(rollno__iexact=profile.roll_no).first()
        if student_record:
            enrollments = StudentCourse.objects.select_related("course").filter(student=student_record).order_by("semester", "course__course_id")
            marks_and_grades = [
                {
                    "course_id": enrollment.course.course_id,
                    "course_name": enrollment.course.course_name,
                    "semester": enrollment.semester,
                    "marks": None,
                    "grade": enrollment.grade,
                }
                for enrollment in enrollments
            ]
    elif profile.role == "faculty":
        faculty_record = Faculty.objects.filter(email__iexact=profile.user.email).first()
        if faculty_record:
            faculty_info = {
                "designation": faculty_record.designation,
                "department": faculty_record.department.dept_name if faculty_record.department else None,
                "honor": faculty_record.honor,
                "experience": faculty_record.experience,
                "phone_number": faculty_record.phone_number,
                "research_area": faculty_record.research_area,
                "address": faculty_record.address,
                "email": faculty_record.email,
            }

    user_data = {
        "id": profile.user.id,
        "username": profile.user.username,
        "full_name": profile.user.first_name,
        "email": profile.user.email,
        "role": profile.role,
        "roll_no": profile.roll_no,
        "department_id": profile.department.dept_id if profile.department else None,
        "department": profile.department.dept_name if profile.department else None,
        "branch_id": profile.branch.branch_id if profile.branch else None,
        "branch": profile.branch.branch_name if profile.branch else None,
        "batch_id": profile.batch.id if profile.batch else None,
        "batch": profile.batch.batch_name if profile.batch else None,
    }

    return cors_response({"success": True, "user": user_data, "marks_and_grades": marks_and_grades, "faculty_info": faculty_info})


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def update_managed_user_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    auth_error = validate_admin_or_403(payload)
    if auth_error:
        return auth_error

    user_id = payload.get("user_id")
    username = normalize_erp_email(payload.get("username", ""))
    full_name = str(payload.get("full_name", "")).strip()
    roll_no = str(payload.get("roll_no", "")).strip().upper()
    email = normalize_erp_email(payload.get("email", ""))
    role = normalize_role(payload.get("role", ""))
    department_id = payload.get("department_id")
    branch_id = payload.get("branch_id")
    batch_id = payload.get("batch_id")
    new_password = str(payload.get("new_password", ""))
    confirm_password = str(payload.get("confirm_password", ""))
    faculty_name = str(payload.get("faculty_name", "")).strip()
    faculty_email = normalize_erp_email(payload.get("faculty_email", ""))
    faculty_designation = str(payload.get("faculty_designation", "")).strip()
    faculty_honor = str(payload.get("faculty_honor", "")).strip()
    faculty_experience = str(payload.get("faculty_experience", "")).strip()
    faculty_phone_number = str(payload.get("faculty_phone_number", "")).strip()
    faculty_research_area = str(payload.get("faculty_research_area", "")).strip()
    faculty_address = str(payload.get("faculty_address", "")).strip()

    if not user_id:
        return cors_response({"success": False, "message": "User id is required."}, status=400)

    if role == "student":
        username = email

    if role == "faculty":
        faculty_email = faculty_email or normalize_erp_email(username)
        username = faculty_email

    if not username or role not in {"student", "faculty"}:
        return cors_response({"success": False, "message": "Valid username and role are required."}, status=400)

    if role == "student":
        if not full_name or not roll_no or not email:
            return cors_response({"success": False, "message": "Name, roll number, and email are required for student."}, status=400)
        if "@" not in email:
            return cors_response({"success": False, "message": "Valid email is required for student."}, status=400)

    if new_password or confirm_password:
        if len(new_password) < 8:
            return cors_response({"success": False, "message": "Password must be at least 8 characters."}, status=400)
        if new_password != confirm_password:
            return cors_response({"success": False, "message": "Passwords do not match."}, status=400)

    try:
        target_user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return cors_response({"success": False, "message": "User not found."}, status=404)

    try:
        profile = UserProfile.objects.get(user=target_user)
    except UserProfile.DoesNotExist:
        return cors_response({"success": False, "message": "User profile not found."}, status=404)

    old_role = profile.role
    old_email = (target_user.email or "").strip().lower()

    username_taken = User.objects.exclude(pk=target_user.id).filter(username__iexact=username).exists()
    if username_taken:
        return cors_response({"success": False, "message": "Username already exists."}, status=409)

    department = None
    branch = None
    batch = None
    profile_roll_no = None

    if role == "faculty":
        if not department_id:
            return cors_response({"success": False, "message": "Department is required."}, status=400)

        try:
            department = Department.objects.get(pk=department_id)
        except Department.DoesNotExist:
            return cors_response({"success": False, "message": "Invalid department selected."}, status=400)

    if role == "student":
        try:
            department, branch = resolve_student_department_branch(username, department_id, branch_id)
            batch = resolve_student_batch(branch, batch_id)
        except ValueError as error:
            return cors_response({"success": False, "message": str(error)}, status=400)
        profile_roll_no = roll_no

    if role == "faculty":
        if not faculty_name:
            faculty_name = username

        if not faculty_email:
            if "@" in username:
                faculty_email = normalize_erp_email(username)
            else:
                return cors_response({"success": False, "message": "Faculty email is required."}, status=400)

        email_taken_by_other = User.objects.exclude(pk=target_user.id).filter(username__iexact=faculty_email).exists()
        if email_taken_by_other:
            return cors_response({"success": False, "message": "Faculty email is already used by another user."}, status=409)

        faculty_record_for_old_email = Faculty.objects.filter(email__iexact=old_email).first() if old_email else None
        duplicate_faculty = Faculty.objects.filter(email__iexact=faculty_email)
        if faculty_record_for_old_email:
            duplicate_faculty = duplicate_faculty.exclude(pk=faculty_record_for_old_email.pk)
        if duplicate_faculty.exists():
            return cors_response({"success": False, "message": "Faculty email already exists."}, status=409)

    with transaction.atomic():
        target_user.username = username

        if role == "student":
            target_user.first_name = full_name
            target_user.email = email

        if role == "faculty":
            target_user.first_name = faculty_name
            target_user.email = faculty_email

        if new_password:
            target_user.set_password(new_password)
            target_user.save()
        else:
            update_fields = ["username", "first_name", "email"] if role in {"student", "faculty"} else ["username"]
            target_user.save(update_fields=update_fields)

        target_user.groups.clear()
        role_group, _ = Group.objects.get_or_create(name=role)
        target_user.groups.add(role_group)

        profile.role = role
        profile.roll_no = profile_roll_no if role == "student" else None
        profile.department = department
        profile.branch = branch if role == "student" else None
        profile.batch = batch if role == "student" else None
        profile.save(update_fields=["role", "roll_no", "department", "branch", "batch"])

        if old_role == "faculty" and role != "faculty" and old_email:
            Faculty.objects.filter(email__iexact=old_email).delete()

        if role == "faculty":
            faculty_record = faculty_record_for_old_email or Faculty.objects.filter(email__iexact=faculty_email).first()

            if faculty_record is None:
                Faculty.objects.create(
                    name=faculty_name,
                    email=faculty_email,
                    department=department,
                    designation=faculty_designation,
                    honor=faculty_honor,
                    experience=faculty_experience,
                    phone_number=faculty_phone_number,
                    research_area=faculty_research_area,
                    address=faculty_address,
                )
            else:
                faculty_record.name = faculty_name
                faculty_record.email = faculty_email
                faculty_record.department = department
                faculty_record.designation = faculty_designation
                faculty_record.honor = faculty_honor
                faculty_record.experience = faculty_experience
                faculty_record.phone_number = faculty_phone_number
                faculty_record.research_area = faculty_research_area
                faculty_record.address = faculty_address
                faculty_record.save(update_fields=["name", "email", "department", "designation", "honor", "experience", "phone_number", "research_area", "address"])

    return cors_response({"success": True, "message": "User updated successfully."})


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def change_password_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    username = normalize_erp_email(payload.get("username", ""))
    old_password = str(payload.get("old_password", ""))
    new_password = str(payload.get("new_password", ""))
    confirm_password = str(payload.get("confirm_password", ""))

    if not username or not old_password or not new_password or not confirm_password:
        return cors_response({"success": False, "message": "All fields are required."}, status=400)

    if new_password != confirm_password:
        return cors_response({"success": False, "message": "Passwords do not match."}, status=400)

    if len(new_password) < 8:
        return cors_response({"success": False, "message": "Password must be at least 8 characters."}, status=400)

    user = authenticate(request, username=username, password=old_password)
    if user is None:
        return cors_response({"success": False, "message": "Current password is incorrect."}, status=401)

    user.set_password(new_password)
    user.save(update_fields=["password"])

    return cors_response({"success": True, "message": "Password changed successfully."})


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def delete_managed_user_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    auth_error = validate_admin_or_403(payload)
    if auth_error:
        return auth_error

    user_id = payload.get("user_id")
    if not user_id:
        return cors_response({"success": False, "message": "User id is required."}, status=400)

    try:
        target_user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return cors_response({"success": False, "message": "User not found."}, status=404)

    role_values = set(target_user.groups.values_list("name", flat=True))
    if "student" not in role_values and "faculty" not in role_values:
        return cors_response({"success": False, "message": "Only student and faculty users can be managed here."}, status=400)

    if "faculty" in role_values:
        faculty_email = (target_user.email or "").strip().lower()
        if not faculty_email and "@" in target_user.username:
            faculty_email = target_user.username.strip().lower()
        if faculty_email:
            Faculty.objects.filter(email__iexact=faculty_email).delete()

    target_user.delete()
    return cors_response({"success": True, "message": "User deleted successfully."})


@csrf_exempt
@require_http_methods(["GET", "OPTIONS"])
def get_timetable_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    record = SharedTimetable.objects.order_by("-updated_at").first()
    if record is None:
        return cors_response(
            {
                "success": True,
                "updated_at": None,
                "timetable": {
                    "batches": [],
                    "timetableData": {
                        "monday": {},
                        "tuesday": {},
                        "wednesday": {},
                        "thursday": {},
                        "friday": {},
                        "saturday": {},
                    },
                },
            }
        )

    return cors_response(
        {
            "success": True,
            "updated_at": record.updated_at.isoformat(),
            "timetable": record.data,
        }
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def get_faculty_timetable_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    username = normalize_erp_email(payload.get("username", ""))
    if not username:
        return cors_response({"success": False, "message": "Username is required."}, status=400)

    faculty = Faculty.objects.filter(email__iexact=username).first()
    if faculty is None:
        return cors_response({"success": False, "message": "Faculty not found."}, status=404)

    assigned_batch_ids = {
        str(batch_id)
        for batch_id in CourseBatch.objects.filter(faculty=faculty)
        .values_list("batch_id", flat=True)
        .distinct()
    }

    record = SharedTimetable.objects.order_by("-updated_at").first()
    empty_timetable = {
        "batches": [],
        "timetableData": {
            "monday": {},
            "tuesday": {},
            "wednesday": {},
            "thursday": {},
            "friday": {},
            "saturday": {},
        },
    }

    if record is None or not assigned_batch_ids:
        return cors_response(
            {
                "success": True,
                "updated_at": record.updated_at.isoformat() if record else None,
                "timetable": empty_timetable,
            }
        )

    record_data = record.data if isinstance(record.data, dict) else {}
    published_batches = record_data.get("batches", [])
    published_timetable = record_data.get("timetableData", {})

    filtered_batches = []
    if isinstance(published_batches, list):
        filtered_batches = [
            batch
            for batch in published_batches
            if str(batch.get("branch_batch_id") or batch.get("id") or "") in assigned_batch_ids
        ]

    filtered_timetable = {}
    for day in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]:
        day_data = published_timetable.get(day, {}) if isinstance(published_timetable, dict) else {}
        filtered_timetable[day] = {
            str(batch_id): slots
            for batch_id, slots in day_data.items()
            if str(batch_id) in assigned_batch_ids
        } if isinstance(day_data, dict) else {}

    return cors_response(
        {
            "success": True,
            "updated_at": record.updated_at.isoformat(),
            "timetable": {
                "batches": filtered_batches,
                "timetableData": filtered_timetable,
            },
        }
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def save_timetable_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    editor_role = normalize_role(payload.get("editor_role", ""))
    if editor_role != "admin":
        return cors_response({"success": False, "message": "Only admin can update timetable."}, status=403)

    batches = payload.get("batches", [])
    timetable_data = payload.get("timetableData", {})

    if not isinstance(batches, list) or not isinstance(timetable_data, dict):
        return cors_response({"success": False, "message": "Invalid timetable format."}, status=400)

    record, _ = SharedTimetable.objects.get_or_create(
        id=1,
        defaults={"data": {"batches": batches, "timetableData": timetable_data}},
    )
    record.data = {"batches": batches, "timetableData": timetable_data}
    record.save()

    return cors_response({"success": True, "message": "Timetable saved successfully."})


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def assign_course_to_batch_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    auth_error = validate_admin_or_403(payload)
    if auth_error:
        return auth_error

    batch_id = payload.get("batch_id")
    course_id = str(payload.get("course_id", "")).strip().upper()
    faculty_id = payload.get("faculty_id")

    if not batch_id or not course_id or not faculty_id:
        return cors_response({"success": False, "message": "Batch, course, and faculty are required."}, status=400)

    try:
        batch = BranchBatch.objects.get(pk=batch_id)
    except BranchBatch.DoesNotExist:
        return cors_response({"success": False, "message": "Batch not found."}, status=404)

    try:
        course = Course.objects.get(pk=course_id)
    except Course.DoesNotExist:
        return cors_response({"success": False, "message": "Course not found."}, status=404)

    try:
        faculty = Faculty.objects.get(pk=faculty_id)
    except Faculty.DoesNotExist:
        return cors_response({"success": False, "message": "Faculty not found."}, status=404)

    if faculty.department_id != course.department_id:
        return cors_response({"success": False, "message": "Faculty must belong to the same department as the course."}, status=400)

    course_batch, created = CourseBatch.objects.get_or_create(batch=batch, course=course)
    course_batch.faculty = faculty
    course_batch.save(update_fields=["faculty"])

    if created:
        return cors_response({"success": True, "message": "Course assigned to batch successfully."}, status=201)

    return cors_response({"success": True, "message": "Faculty updated for this batch course."})


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def unassign_course_from_batch_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    auth_error = validate_admin_or_403(payload)
    if auth_error:
        return auth_error

    batch_id = payload.get("batch_id")
    course_id = str(payload.get("course_id", "")).strip().upper()

    if not batch_id or not course_id:
        return cors_response({"success": False, "message": "Batch and course are required."}, status=400)

    try:
        CourseBatch.objects.get(batch_id=batch_id, course_id=course_id).delete()
    except CourseBatch.DoesNotExist:
        return cors_response({"success": False, "message": "Course not assigned to this batch."}, status=404)

    return cors_response({"success": True, "message": "Course unassigned from batch successfully."})


@csrf_exempt
@require_http_methods(["GET", "OPTIONS"])
def get_courses_for_batch_api(request, batch_id):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        batch = BranchBatch.objects.get(pk=batch_id)
    except BranchBatch.DoesNotExist:
        return cors_response({"success": False, "message": "Batch not found."}, status=404)

    courses = []
    for cb in CourseBatch.objects.filter(batch=batch).select_related("course", "faculty"):
        courses.append({
            "id": cb.course.course_id,
            "name": cb.course.course_name,
            "credits": cb.course.credits,
            "department": cb.course.department.dept_name,
            "faculty": cb.faculty.name if cb.faculty else "",
        })

    return cors_response({
        "success": True,
        "batch_id": batch.id,
        "batch_name": batch.batch_name,
        "courses": courses,
    })


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def get_students_in_batch_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    batch_id = payload.get("batch_id")
    if not batch_id:
        return cors_response({"success": False, "message": "Batch id is required."}, status=400)

    try:
        batch = BranchBatch.objects.get(pk=batch_id)
    except BranchBatch.DoesNotExist:
        return cors_response({"success": False, "message": "Batch not found."}, status=404)

    students = []
    profiles = UserProfile.objects.filter(batch=batch, role="student").select_related("user")
    for profile in profiles:
        students.append({
            "user_id": profile.user.id,
            "username": profile.user.username,
            "full_name": profile.user.first_name or profile.user.username,
        })

    return cors_response({
        "success": True,
        "batch_id": batch.id,
        "batch_name": batch.batch_name,
        "students": students,
    })


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def get_students_in_course_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    batch_id = payload.get("batch_id")
    course_id = str(payload.get("course_id", "")).strip().upper()

    if not batch_id or not course_id:
        return cors_response({"success": False, "message": "Batch and course are required."}, status=400)

    try:
        batch = BranchBatch.objects.get(pk=batch_id)
        course = Course.objects.get(pk=course_id)
    except (BranchBatch.DoesNotExist, Course.DoesNotExist):
        return cors_response({"success": False, "message": "Batch or course not found."}, status=404)

    verify_enrollment = CourseBatch.objects.filter(batch=batch, course=course).exists()
    if not verify_enrollment:
        return cors_response({"success": False, "message": "Course not assigned to this batch."}, status=400)

    students = []
    profiles = UserProfile.objects.filter(batch=batch, role="student").select_related("user")
    for profile in profiles:
        students.append({
            "user_id": profile.user.id,
            "username": profile.user.username,
            "full_name": profile.user.first_name or profile.user.username,
        })

    return cors_response({
        "success": True,
        "batch_id": batch.id,
        "batch_name": batch.batch_name,
        "course_id": course.course_id,
        "course_name": course.course_name,
        "students": students,
    })


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def get_faculty_courses_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    username = normalize_erp_email(payload.get("username", ""))
    if not username:
        return cors_response({"success": False, "message": "Username is required."}, status=400)

    faculty = Faculty.objects.select_related("department").filter(email__iexact=username).first()
    if faculty is None:
        return cors_response({"success": False, "message": "Faculty not found."}, status=404)

    student_count_by_batch = {
        row["batch"]: row["total"]
        for row in UserProfile.objects.filter(role="student", batch__isnull=False)
        .values("batch")
        .annotate(total=Count("id"))
    }

    offerings = []
    course_batches = CourseBatch.objects.select_related("course", "batch__branch").filter(faculty=faculty).order_by(
        "batch__year", "batch__batch_name", "course__course_id"
    )
    for course_batch in course_batches:
        offerings.append(
            {
                "batch_id": course_batch.batch_id,
                "batch_name": course_batch.batch.batch_name,
                "semester": course_batch.batch.year,
                "semester_roman": semester_to_roman(course_batch.batch.year),
                "branch_id": course_batch.batch.branch.branch_id,
                "branch_name": course_batch.batch.branch.branch_name,
                "course_id": course_batch.course.course_id,
                "course_name": course_batch.course.course_name,
                "total_students": student_count_by_batch.get(course_batch.batch_id, 0),
            }
        )

    return cors_response(
        {
            "success": True,
            "faculty": {
                "id": faculty.faculty_id,
                "name": faculty.name,
                "email": faculty.email,
                "department": faculty.department.dept_name if faculty.department else None,
            },
            "courses": offerings,
        }
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def get_faculty_profile_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    username = normalize_erp_email(payload.get("username", ""))
    if not username:
        return cors_response({"success": False, "message": "Username is required."}, status=400)

    faculty = Faculty.objects.select_related("department").filter(email__iexact=username).first()
    if faculty is None:
        return cors_response({"success": False, "message": "Faculty not found."}, status=404)

    assigned_courses = CourseBatch.objects.filter(faculty=faculty).count()

    return cors_response(
        {
            "success": True,
            "profile": {
                "id": faculty.faculty_id,
                "name": faculty.name,
                "email": faculty.email,
                "designation": faculty.designation or "Faculty Member",
                "department": faculty.department.dept_name if faculty.department else "-",
                "phone": faculty.phone_number or "-",
                "research_area": faculty.research_area or "-",
                "address": faculty.address or "-",
                "honor": faculty.honor or "-",
                "experience": faculty.experience or "-",
                "assigned_courses": assigned_courses,
            },
        }
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def get_faculty_course_students_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    username = normalize_erp_email(payload.get("username", ""))
    batch_id = payload.get("batch_id")
    course_id = str(payload.get("course_id", "")).strip().upper()

    if not username or not batch_id or not course_id:
        return cors_response({"success": False, "message": "Username, batch, and course are required."}, status=400)

    faculty = Faculty.objects.filter(email__iexact=username).first()
    if faculty is None:
        return cors_response({"success": False, "message": "Faculty not found."}, status=404)

    try:
        course_batch = CourseBatch.objects.select_related("batch", "course").get(
            batch_id=batch_id,
            course_id=course_id,
            faculty=faculty,
        )
    except CourseBatch.DoesNotExist:
        return cors_response({"success": False, "message": "This course is not assigned to the logged-in faculty."}, status=403)

    profiles = UserProfile.objects.filter(batch=course_batch.batch, role="student").select_related("user").order_by("roll_no", "user__first_name")

    students = []
    for profile in profiles:
        roll_no = str(profile.roll_no or "").strip().upper()
        student_record = Student.objects.filter(rollno__iexact=roll_no).first() if roll_no else None

        attendance_rows = Attendance.objects.none()
        if student_record:
            attendance_rows = Attendance.objects.filter(student=student_record, course=course_batch.course)

        total_classes = attendance_rows.count()
        present_classes = attendance_rows.filter(status="Present").count()
        percentage = round((present_classes * 100.0 / total_classes), 2) if total_classes else 0.0

        students.append(
            {
                "id": profile.user.id,
                "name": profile.user.first_name or profile.user.username,
                "roll_no": roll_no,
                "email": profile.user.email or "-",
                "phone": "-",
                "attendance": {
                    "present": present_classes,
                    "total": total_classes,
                    "percentage": percentage,
                },
            }
        )

    return cors_response(
        {
            "success": True,
            "batch": {
                "id": course_batch.batch.id,
                "name": course_batch.batch.batch_name,
                "semester": course_batch.batch.year,
                "semester_roman": semester_to_roman(course_batch.batch.year),
                "branch_id": course_batch.batch.branch.branch_id,
                "branch_name": course_batch.batch.branch.branch_name,
            },
            "course": {
                "id": course_batch.course.course_id,
                "name": course_batch.course.course_name,
                "credits": course_batch.course.credits,
            },
            "students": students,
        }
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def get_faculty_attendance_students_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    username = normalize_erp_email(payload.get("username", ""))
    batch_id = payload.get("batch_id")
    course_id = str(payload.get("course_id", "")).strip().upper()

    if not username or not batch_id or not course_id:
        return cors_response({"success": False, "message": "Username, batch, and course are required."}, status=400)

    try:
        attendance_date = parse_iso_date(payload.get("date"))
    except ValueError as error:
        return cors_response({"success": False, "message": str(error)}, status=400)

    faculty = Faculty.objects.filter(email__iexact=username).first()
    if faculty is None:
        return cors_response({"success": False, "message": "Faculty not found."}, status=404)

    try:
        course_batch = CourseBatch.objects.select_related("batch", "course").get(
            batch_id=batch_id,
            course_id=course_id,
            faculty=faculty,
        )
    except CourseBatch.DoesNotExist:
        return cors_response({"success": False, "message": "This course is not assigned to the logged-in faculty."}, status=403)

    profiles = UserProfile.objects.filter(batch=course_batch.batch, role="student").select_related("user").order_by("roll_no", "user__first_name")
    roll_nos = [str(profile.roll_no or "").strip().upper() for profile in profiles if profile.roll_no]
    students_by_roll = {
        student.rollno.upper(): student
        for student in Student.objects.filter(rollno__in=roll_nos)
    }

    existing = {
        attendance.student_id.upper(): attendance.status
        for attendance in Attendance.objects.filter(
            course_id=course_id,
            date=attendance_date,
            student_id__in=[student.rollno for student in students_by_roll.values()],
        )
    }

    students = []
    for profile in profiles:
        roll_no = str(profile.roll_no or "").strip().upper()
        linked_student = students_by_roll.get(roll_no)
        students.append(
            {
                "username": profile.user.username,
                "full_name": profile.user.first_name or profile.user.username,
                "roll_no": roll_no,
                "can_mark": linked_student is not None,
                "status": existing.get(roll_no, "Absent") if linked_student else None,
            }
        )

    return cors_response(
        {
            "success": True,
            "batch": {
                "id": course_batch.batch.id,
                "name": course_batch.batch.batch_name,
                "semester": course_batch.batch.year,
                "semester_roman": semester_to_roman(course_batch.batch.year),
            },
            "course": {
                "id": course_batch.course.course_id,
                "name": course_batch.course.course_name,
            },
            "date": attendance_date.isoformat(),
            "students": students,
        }
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def save_faculty_attendance_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    username = normalize_erp_email(payload.get("username", ""))
    batch_id = payload.get("batch_id")
    course_id = str(payload.get("course_id", "")).strip().upper()
    records = payload.get("records")

    if not username or not batch_id or not course_id:
        return cors_response({"success": False, "message": "Username, batch, and course are required."}, status=400)

    if not isinstance(records, list) or len(records) == 0:
        return cors_response({"success": False, "message": "Attendance records are required."}, status=400)

    try:
        attendance_date = parse_iso_date(payload.get("date"))
    except ValueError as error:
        return cors_response({"success": False, "message": str(error)}, status=400)

    if attendance_date > date_class.today():
        return cors_response({"success": False, "message": "Attendance cannot be marked for a future date."}, status=400)

    faculty = Faculty.objects.filter(email__iexact=username).first()
    if faculty is None:
        return cors_response({"success": False, "message": "Faculty not found."}, status=404)

    is_assigned = CourseBatch.objects.filter(batch_id=batch_id, course_id=course_id, faculty=faculty).exists()
    if not is_assigned:
        return cors_response({"success": False, "message": "This course is not assigned to the logged-in faculty."}, status=403)

    valid_statuses = {"Present", "Absent"}
    roll_numbers = []
    normalized_records = []
    for record in records:
        if not isinstance(record, dict):
            continue

        roll_no = str(record.get("roll_no", "")).strip().upper()
        status = str(record.get("status", "")).strip().title()
        if not roll_no or status not in valid_statuses:
            continue

        roll_numbers.append(roll_no)
        normalized_records.append({"roll_no": roll_no, "status": status})

    if not normalized_records:
        return cors_response({"success": False, "message": "No valid attendance records provided."}, status=400)

    valid_students = {
        student.rollno.upper(): student
        for student in Student.objects.filter(rollno__in=roll_numbers)
    }

    # Only allow saving attendance for students currently in the selected batch.
    allowed_rolls = {
        str(roll_no).strip().upper()
        for roll_no in UserProfile.objects.filter(batch_id=batch_id, role="student").values_list("roll_no", flat=True)
        if roll_no
    }

    saved = 0
    skipped = 0
    with transaction.atomic():
        for record in normalized_records:
            roll_no = record["roll_no"]
            status = record["status"]

            student = valid_students.get(roll_no)
            if student is None or roll_no not in allowed_rolls:
                skipped += 1
                continue

            Attendance.objects.update_or_create(
                student=student,
                course_id=course_id,
                date=attendance_date,
                defaults={"status": status},
            )
            saved += 1

    return cors_response(
        {
            "success": True,
            "message": "Attendance saved successfully.",
            "saved": saved,
            "skipped": skipped,
            "date": attendance_date.isoformat(),
        }
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def get_student_results_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    username = str(payload.get("username", "")).strip()
    if not username:
        return cors_response({"success": False, "message": "Username is required."}, status=400)

    try:
        user = User.objects.get(username=username)
    except User.DoesNotExist:
        return cors_response({"success": False, "message": "Student not found."}, status=404)

    profile = UserProfile.objects.select_related("branch", "batch", "department").filter(user=user, role="student").first()
    if profile is None:
        return cors_response({"success": False, "message": "Student profile not found."}, status=404)

    student_record = None
    if profile.roll_no:
        student_record = Student.objects.filter(rollno__iexact=profile.roll_no).first()

    if student_record is None:
        return cors_response({"success": False, "message": "Student academic record not found."}, status=404)

    semester_map = {}
    overall_credit_points = 0.0
    overall_credits = 0

    enrollments = (
        StudentCourse.objects.select_related("course", "course__department")
        .filter(student=student_record)
        .order_by("semester", "course__course_id")
    )

    for enrollment in enrollments:
        semester = int(enrollment.semester)
        if semester not in semester_map:
            semester_map[semester] = {
                "semester": semester,
                "semester_roman": semester_to_roman(semester),
                "courses": [],
                "sgpa": None,
                "total_credits": 0,
            }

        points = grade_to_points(enrollment.grade)
        credits = int(enrollment.course.credits or 0)

        semester_map[semester]["courses"].append(
            {
                "course_id": enrollment.course.course_id,
                "course_name": enrollment.course.course_name,
                "credits": credits,
                "department": enrollment.course.department.dept_name,
                "grade": enrollment.grade or "-",
                "grade_points": points,
            }
        )

        if points is not None and credits > 0:
            semester_map[semester]["total_credits"] += credits

    for semester in semester_map.values():
        sem_credit_points = 0.0
        sem_credits = 0
        for course in semester["courses"]:
            points = course.get("grade_points")
            credits = int(course.get("credits") or 0)
            if points is None or credits <= 0:
                continue

            sem_credit_points += points * credits
            sem_credits += credits

        if sem_credits > 0:
            semester["sgpa"] = round(sem_credit_points / sem_credits, 2)
            overall_credit_points += sem_credit_points
            overall_credits += sem_credits
        else:
            semester["sgpa"] = None

    cgpa = round(overall_credit_points / overall_credits, 2) if overall_credits > 0 else None
    semesters = [semester_map[key] for key in sorted(semester_map.keys(), reverse=True)]

    return cors_response(
        {
            "success": True,
            "student": {
                "id": user.id,
                "username": user.username,
                "full_name": user.first_name or user.username,
                "branch": profile.branch.branch_name if profile.branch else None,
                "branch_id": profile.branch.branch_id if profile.branch else None,
                "batch_id": profile.batch.id if profile.batch else None,
                "batch_name": profile.batch.batch_name if profile.batch else None,
                "current_semester": profile.batch.year if profile.batch else None,
                "current_semester_roman": semester_to_roman(profile.batch.year) if profile.batch else None,
            },
            "cgpa": cgpa,
            "total_graded_credits": overall_credits,
            "semesters": semesters,
        }
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def raise_missed_class_attendance_query_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    username = str(payload.get("username", "")).strip()
    course_id = str(payload.get("course_id", "")).strip().upper()
    missed_date_str = str(payload.get("missed_date", "")).strip()
    reason = str(payload.get("reason", "")).strip()

    if not username or not course_id or not missed_date_str:
        return cors_response({"success": False, "message": "Username, course, and missed class date are required."}, status=400)

    try:
        missed_date = parse_iso_date(missed_date_str)
    except ValueError as error:
        return cors_response({"success": False, "message": str(error)}, status=400)

    try:
        user = User.objects.get(username=username)
    except User.DoesNotExist:
        return cors_response({"success": False, "message": "Student not found."}, status=404)

    profile = UserProfile.objects.filter(user=user, role="student").first()
    if profile is None or not profile.roll_no:
        return cors_response({"success": False, "message": "Student profile not found."}, status=404)

    student_record = Student.objects.filter(rollno__iexact=profile.roll_no).first()
    if student_record is None:
        return cors_response({"success": False, "message": "Student record not found."}, status=404)

    # Query can only be raised if the selected date is actually marked absent.
    was_absent = Attendance.objects.filter(
        student=student_record,
        course_id=course_id,
        date=missed_date,
        status="Absent",
    ).exists()
    if not was_absent:
        return cors_response({"success": False, "message": "No missed class found for this course on the selected date."}, status=400)

    reason_text = reason if reason else "Attendance correction request"
    query_type = f"ATTQ|{course_id}|{missed_date.isoformat()}"

    duplicate_exists = Application.objects.filter(
        student=student_record,
        type=query_type,
        status__iexact="Pending",
    ).exists()
    if duplicate_exists:
        return cors_response({"success": False, "message": "A pending query for this missed class already exists."}, status=409)

    application = Application.objects.create(
        student=student_record,
        type=query_type,
        status="Pending",
    )

    return cors_response(
        {
            "success": True,
            "message": "Attendance query raised successfully.",
            "query": {
                "application_id": application.application_id,
                "course_id": course_id,
                "missed_date": missed_date.isoformat(),
                "status": application.status,
                "reason": reason_text,
                "reference": query_type,
            },
        },
        status=201,
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def get_student_current_semester_attendance_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    username = str(payload.get("username", "")).strip()
    if not username:
        return cors_response({"success": False, "message": "Username is required."}, status=400)

    try:
        user = User.objects.get(username=username)
    except User.DoesNotExist:
        return cors_response({"success": False, "message": "Student not found."}, status=404)

    profile = UserProfile.objects.select_related("branch", "batch", "department").filter(user=user, role="student").first()
    if profile is None:
        return cors_response({"success": False, "message": "Student profile not found."}, status=404)

    if profile.batch is None:
        return cors_response({"success": False, "message": "Student batch is not assigned."}, status=400)

    student_record = None
    if profile.roll_no:
        student_record = Student.objects.filter(rollno__iexact=profile.roll_no).first()

    course_batches = list(
        CourseBatch.objects.select_related("course", "course__department", "faculty")
        .filter(batch=profile.batch)
        .order_by("course__course_id")
    )
    course_ids = [cb.course_id for cb in course_batches]

    attendance_stats = {}
    missed_dates = {}
    if student_record and course_ids:
        for row in (
            Attendance.objects.filter(student=student_record, course_id__in=course_ids)
            .values("course_id")
            .annotate(total=Count("id"), present=Count("id", filter=Q(status="Present")))
        ):
            total = int(row["total"] or 0)
            present = int(row["present"] or 0)
            absent = total - present
            attendance_stats[row["course_id"]] = {
                "present": present,
                "total": total,
                "absent": absent,
                "percentage": round((present * 100.0 / total), 2) if total else 0.0,
            }

        absent_rows = (
            Attendance.objects.filter(student=student_record, course_id__in=course_ids, status="Absent")
            .values("course_id", "date")
            .order_by("course_id", "-date")
        )
        for row in absent_rows:
            missed_dates.setdefault(row["course_id"], []).append(row["date"].isoformat())

    courses = []
    for cb in course_batches:
        stats = attendance_stats.get(cb.course_id, {"present": 0, "total": 0, "absent": 0, "percentage": 0.0})
        absent_list = missed_dates.get(cb.course_id, [])
        courses.append(
            {
                "course_id": cb.course.course_id,
                "course_name": cb.course.course_name,
                "credits": cb.course.credits,
                "department": cb.course.department.dept_name,
                "faculty": cb.faculty.name if cb.faculty else "-",
                "attendance": stats,
                "missed_classes": absent_list,
                "missed_count": len(absent_list),
            }
        )

    return cors_response(
        {
            "success": True,
            "student": {
                "id": user.id,
                "username": user.username,
                "full_name": user.first_name or user.username,
                "branch": profile.branch.branch_name if profile.branch else None,
                "branch_id": profile.branch.branch_id if profile.branch else None,
                "batch_id": profile.batch.id,
                "batch_name": profile.batch.batch_name,
                "semester": profile.batch.year,
                "semester_roman": semester_to_roman(profile.batch.year),
            },
            "courses": courses,
        }
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def get_student_my_courses_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    username = str(payload.get("username", "")).strip()
    if not username:
        return cors_response({"success": False, "message": "Username is required."}, status=400)

    try:
        user = User.objects.get(username=username)
    except User.DoesNotExist:
        return cors_response({"success": False, "message": "Student not found."}, status=404)

    profile = UserProfile.objects.select_related("branch", "batch", "department").filter(user=user, role="student").first()
    if profile is None:
        return cors_response({"success": False, "message": "Student profile not found."}, status=404)

    if profile.batch is None or profile.branch is None:
        return cors_response(
            {
                "success": False,
                "message": "Student is not assigned to a branch batch yet.",
                "courses": [],
            },
            status=400,
        )

    semester_map = {}

    def ensure_semester_bucket(semester_value):
        semester_number = int(semester_value)
        if semester_number not in semester_map:
            semester_map[semester_number] = {
                "semester": semester_number,
                "semester_roman": semester_to_roman(semester_number),
                "courses": [],
            }
        return semester_map[semester_number]

    student_record = None
    if profile.roll_no:
        student_record = Student.objects.filter(rollno__iexact=profile.roll_no).first()

    enrollment_grade_map = {}
    attendance_stats_map = {}

    # Primary source: courses and grades actually recorded for the student.
    if student_record:
        attendance_stats = Attendance.objects.filter(student=student_record).values("course_id").annotate(
            total=Count("id"),
            present=Count("id", filter=Q(status="Present")),
        )
        for row in attendance_stats:
            total = int(row["total"] or 0)
            present = int(row["present"] or 0)
            attendance_stats_map[row["course_id"]] = {
                "present": present,
                "total": total,
                "percentage": round((present * 100.0 / total), 2) if total else 0.0,
            }

        enrollments = StudentCourse.objects.select_related("course", "course__department").filter(student=student_record).order_by("semester", "course__course_id")
        for enrollment in enrollments:
            enrollment_grade_map[(enrollment.semester, enrollment.course.course_id)] = enrollment.grade or "-"
            faculty_assignment = (
                CourseBatch.objects.select_related("faculty")
                .filter(batch__branch=profile.branch, batch__year=enrollment.semester, course=enrollment.course)
                .first()
            )

            bucket = ensure_semester_bucket(enrollment.semester)
            bucket["courses"].append(
                {
                    "course_id": enrollment.course.course_id,
                    "course_name": enrollment.course.course_name,
                    "credits": enrollment.course.credits,
                    "department": enrollment.course.department.dept_name,
                    "faculty": faculty_assignment.faculty.name if faculty_assignment and faculty_assignment.faculty else "-",
                    "grade": enrollment.grade or "-",
                    "attendance": attendance_stats_map.get(
                        enrollment.course.course_id,
                        {"present": 0, "total": 0, "percentage": 0.0},
                    ),
                }
            )

    # Always include current semester offerings so current semester appears at top.
    current_batches = CourseBatch.objects.filter(batch=profile.batch).select_related(
        "course", "course__department", "faculty", "batch"
    )
    current_bucket = ensure_semester_bucket(profile.batch.year)
    existing_current_ids = {course.get("course_id") for course in current_bucket["courses"]}
    for cb in current_batches:
        if cb.course.course_id in existing_current_ids:
            continue

        current_bucket["courses"].append(
            {
                "course_id": cb.course.course_id,
                "course_name": cb.course.course_name,
                "credits": cb.course.credits,
                "department": cb.course.department.dept_name,
                "faculty": cb.faculty.name if cb.faculty else "-",
                "grade": enrollment_grade_map.get((profile.batch.year, cb.course.course_id), "-"),
                "attendance": attendance_stats_map.get(
                    cb.course.course_id,
                    {"present": 0, "total": 0, "percentage": 0.0},
                ),
            }
        )

    # Keep current/latest semester at top, then older semesters below.
    semesters = [semester_map[key] for key in sorted(semester_map.keys(), reverse=True)]

    return cors_response(
        {
            "success": True,
            "student": {
                "id": user.id,
                "username": user.username,
                "full_name": user.first_name or user.username,
                "department": profile.department.dept_name if profile.department else None,
                "branch_id": profile.branch.branch_id,
                "branch": profile.branch.branch_name,
                "batch_id": profile.batch.id,
                "batch_name": profile.batch.batch_name,
                "semester": profile.batch.year,
                "semester_roman": semester_to_roman(profile.batch.year),
            },
            "semesters": semesters,
        }
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def add_admin_api(request):
    """Add a new admin user."""
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    # Validate requesting admin credentials
    error_response = validate_admin_or_403(payload)
    if error_response:
        return error_response

    admin_email = normalize_erp_email(payload.get("admin_email", ""))
    new_admin_password = str(payload.get("new_admin_password", payload.get("admin_password", ""))).strip()

    if not admin_email or not new_admin_password:
        return cors_response(
            {"success": False, "message": "Admin email and password are required."}, 
            status=400
        )

    # Check if user already exists
    if User.objects.filter(username=admin_email).exists():
        return cors_response(
            {"success": False, "message": f"Admin user {admin_email} already exists."}, 
            status=400
        )

    try:
        # Create the user
        user = User.objects.create_user(
            username=admin_email,
            email=admin_email,
            password=new_admin_password,
            is_active=True,
        )

        # Add to admin group
        admin_group, _ = Group.objects.get_or_create(name="admin")
        user.groups.add(admin_group)

        # Create UserProfile
        UserProfile.objects.create(
            user=user,
            roll_no=admin_email,
            role="admin",
        )

        return cors_response(
            {
                "success": True,
                "message": f"Admin user {admin_email} created successfully.",
                "admin": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "role": "admin",
                },
            }
        )
    except Exception as e:
        return cors_response(
            {"success": False, "message": f"Error creating admin: {str(e)}"}, 
            status=500
        )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def list_admins_api(request):
    """List all admin users"""
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    # Validate requesting admin credentials
    error_response = validate_admin_or_403(payload)
    if error_response:
        return error_response

    try:
        admin_group = Group.objects.filter(name="admin").first()
        if not admin_group:
            return cors_response({"success": True, "admins": []})

        admins = []
        for user in admin_group.user_set.all():
            profile = UserProfile.objects.filter(user=user).first()
            admins.append(
                {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "department": profile.department.dept_name if profile and profile.department else None,
                    "is_active": user.is_active,
                    "created_at": user.date_joined.isoformat() if user.date_joined else None,
                }
            )

        return cors_response(
            {
                "success": True,
                "admins": admins,
                "total": len(admins),
            }
        )
    except Exception as e:
        return cors_response(
            {"success": False, "message": f"Error listing admins: {str(e)}"}, 
            status=500
        )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def delete_admin_api(request):
    """Delete an admin user."""
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    # Validate requesting admin credentials
    error_response = validate_admin_or_403(payload)
    if error_response:
        return error_response

    admin_email = normalize_erp_email(payload.get("admin_email", ""))
    if not admin_email:
        return cors_response(
            {"success": False, "message": "Admin email is required."}, 
            status=400
        )

    try:
        user = User.objects.get(username=admin_email)
    except User.DoesNotExist:
        return cors_response(
            {"success": False, "message": f"Admin user {admin_email} not found."},
            status=404
        )

    if not user_has_role(user, "admin"):
        return cors_response(
            {"success": False, "message": f"User {admin_email} is not an admin."},
            status=400
        )

    total_admins = User.objects.filter(groups__name__in=["admin", "academic"]).distinct().count()
    if total_admins <= 1:
        return cors_response(
            {"success": False, "message": "At least one admin must remain in the system."},
            status=400
        )

    username = user.username
    user.delete()

    return cors_response(
        {
            "success": True,
            "message": f"Admin user {username} deleted successfully.",
        }
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def reset_admin_password_api(request):
    """Reset password for an admin user."""
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    # Validate requesting admin credentials
    error_response = validate_admin_or_403(payload)
    if error_response:
        return error_response

    admin_email = normalize_erp_email(payload.get("admin_email", ""))
    new_password = str(payload.get("new_password", "")).strip()

    if not admin_email or not new_password:
        return cors_response(
            {"success": False, "message": "Admin email and new password are required."},
            status=400
        )

    try:
        user = User.objects.get(username=admin_email)
        if not user_has_role(user, "admin"):
            return cors_response(
                {"success": False, "message": f"User {admin_email} is not an admin."},
                status=400
            )
        user.set_password(new_password)
        user.save()

        return cors_response(
            {
                "success": True,
                "message": f"Password for admin {admin_email} reset successfully.",
                "admin": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                },
            }
        )
    except User.DoesNotExist:
        return cors_response(
            {"success": False, "message": f"Admin user {admin_email} not found."},
            status=404
        )
    except Exception as e:
        return cors_response(
            {"success": False, "message": f"Error resetting password: {str(e)}"},
            status=500
        )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def update_admin_api(request):
    """Update admin user details."""
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    # Validate requesting admin credentials
    error_response = validate_admin_or_403(payload)
    if error_response:
        return error_response

    admin_email = normalize_erp_email(payload.get("admin_email", ""))
    if not admin_email:
        return cors_response(
            {"success": False, "message": "Admin email is required."}, 
            status=400
        )

    try:
        user = User.objects.get(username=admin_email)
        if not user_has_role(user, "admin"):
            return cors_response(
                {"success": False, "message": f"User {admin_email} is not an admin."},
                status=400
            )
        
        # Update first and last name if provided
        if "first_name" in payload:
            user.first_name = str(payload.get("first_name", "")).strip()
        if "last_name" in payload:
            user.last_name = str(payload.get("last_name", "")).strip()
        if "is_active" in payload:
            user.is_active = bool(payload.get("is_active", True))
        
        user.save()

        # Update profile if needed
        profile = UserProfile.objects.filter(user=user).first()
        if profile and "department_id" in payload:
            try:
                department = Department.objects.get(id=payload.get("department_id"))
                profile.department = department
                profile.save()
            except Department.DoesNotExist:
                pass

        return cors_response(
            {
                "success": True,
                "message": f"Admin {admin_email} updated successfully.",
                "admin": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "is_active": user.is_active,
                },
            }
        )
    except User.DoesNotExist:
        return cors_response(
            {"success": False, "message": f"Admin user {admin_email} not found."}, 
            status=404
        )
    except Exception as e:
        return cors_response(
            {"success": False, "message": f"Error updating admin: {str(e)}"}, 
            status=500
        )
