import json
import re

from django.contrib.auth import authenticate
from django.contrib.auth.models import Group, User
from django.db import connection
from django.db import transaction
from django.db.models import Count
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from academicsection.models import Branch, BranchBatch, Course, Department, Friday, Monday, Saturday, SharedTimetable, Thursday, Tuesday, UserProfile, Wednesday
from faculty.models import Faculty


MASTER_ADMIN_USERNAME = "masterAdmin@erp.ac.in"
MASTER_ADMIN_PASSWORD = "masterAdmin@123"
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


def is_master_admin_credentials(username, password):
    return username == MASTER_ADMIN_USERNAME and password == MASTER_ADMIN_PASSWORD


def parse_master_admin_credentials(payload):
    admin_username = str(payload.get("admin_username", "")).strip()
    admin_password = str(payload.get("admin_password", ""))
    return admin_username, admin_password


def validate_master_admin_or_403(payload):
    admin_username, admin_password = parse_master_admin_credentials(payload)
    if not is_master_admin_credentials(admin_username, admin_password):
        return cors_response({"success": False, "message": "Only master admin can perform this action."}, status=403)
    return None


def semester_to_roman(semester):
    return ROMAN_SEMESTERS.get(int(semester), "")


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

    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    role = normalize_role(payload.get("role", ""))

    if not username or not password:
        return cors_response({"success": False, "message": "Username and password are required."}, status=400)

    if role not in VALID_ROLES:
        return cors_response({"success": False, "message": "Invalid role selected."}, status=400)

    # Master admin is a fixed credential pair requested by project requirements.
    if role == "admin" and is_master_admin_credentials(username, password):
        return cors_response(
            {
                "success": True,
                "message": "Master admin login successful.",
                "user": {
                    "username": MASTER_ADMIN_USERNAME,
                    "role": "admin",
                    "is_master_admin": True,
                },
            }
        )

    user = authenticate(request, username=username, password=password)
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
                "is_master_admin": False,
                "department_id": profile.department.dept_id if profile and profile.department else None,
                "department": profile.department.dept_name if profile and profile.department else None,
                "branch_id": profile.branch.branch_id if profile and profile.branch else None,
                "branch": profile.branch.branch_name if profile and profile.branch else None,
                "batch_id": profile.batch.id if profile and profile.batch else None,
                "batch": profile.batch.batch_name if profile and profile.batch else None,
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

    admin_username, admin_password = parse_master_admin_credentials(payload)
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    confirm_password = str(payload.get("confirm_password", ""))
    role = normalize_role(payload.get("role", ""))
    department_id = payload.get("department_id")
    branch_id = payload.get("branch_id")
    batch_id = payload.get("batch_id")
    faculty_name = str(payload.get("faculty_name", "")).strip()
    faculty_email = str(payload.get("faculty_email", "")).strip().lower()

    if not is_master_admin_credentials(admin_username, admin_password):
        return cors_response({"success": False, "message": "Only master admin can create users."}, status=403)

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
    if role == "student":
        try:
            department, branch = resolve_student_department_branch(username, department_id, branch_id)
            batch = resolve_student_batch(branch, batch_id)
        except ValueError as error:
            return cors_response({"success": False, "message": str(error)}, status=400)

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
            faculty_email = username.lower()

        if not faculty_email:
            return cors_response({"success": False, "message": "Faculty email is required for faculty user."}, status=400)

    with transaction.atomic():
        user = User.objects.create_user(username=username, password=password)
        role_group, _ = Group.objects.get_or_create(name=role)
        user.groups.add(role_group)

        if role == "faculty":
            user.first_name = faculty_name
            user.email = faculty_email
            user.save(update_fields=["first_name", "email"])

        UserProfile.objects.update_or_create(
            user=user,
            defaults={
                "role": role,
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
                faculty_record.save(update_fields=["name", "department", "email"])
            else:
                Faculty.objects.create(name=faculty_name, email=faculty_email, department=department)

    return cors_response(
        {
            "success": True,
            "message": f"{role.title()} user created successfully.",
            "user": {
                "id": user.id,
                "username": user.username,
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

    auth_error = validate_master_admin_or_403(payload)
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

    auth_error = validate_master_admin_or_403(payload)
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

    auth_error = validate_master_admin_or_403(payload)
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

    auth_error = validate_master_admin_or_403(payload)
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

    auth_error = validate_master_admin_or_403(payload)
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

    auth_error = validate_master_admin_or_403(payload)
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

    auth_error = validate_master_admin_or_403(payload)
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

    auth_error = validate_master_admin_or_403(payload)
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

    auth_error = validate_master_admin_or_403(payload)
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

    admin_username, admin_password = parse_master_admin_credentials(payload)
    if not is_master_admin_credentials(admin_username, admin_password):
        return cors_response({"success": False, "message": "Only master admin can view user management."}, status=403)

    role_filter = normalize_role(payload.get("role", ""))
    valid_filters = {"", "student", "faculty"}
    if role_filter not in valid_filters:
        return cors_response({"success": False, "message": "Invalid role filter."}, status=400)

    queryset = UserProfile.objects.select_related("user", "department", "branch", "batch").filter(role__in=["student", "faculty"])
    if role_filter:
        queryset = queryset.filter(role=role_filter)

    users = [
        {
            "id": profile.user.id,
            "username": profile.user.username,
            "full_name": profile.user.first_name,
            "email": profile.user.email,
            "role": profile.role,
            "department_id": profile.department.dept_id if profile.department else None,
            "department": profile.department.dept_name if profile.department else "-",
            "branch_id": profile.branch.branch_id if profile.branch else None,
            "branch": profile.branch.branch_name if profile.branch else "-",
            "batch_id": profile.batch.id if profile.batch else None,
            "batch": profile.batch.batch_name if profile.batch else "-",
        }
        for profile in queryset.order_by("role", "user__username")
    ]

    return cors_response({"success": True, "users": users})


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def update_managed_user_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    admin_username, admin_password = parse_master_admin_credentials(payload)
    if not is_master_admin_credentials(admin_username, admin_password):
        return cors_response({"success": False, "message": "Only master admin can update users."}, status=403)

    user_id = payload.get("user_id")
    username = str(payload.get("username", "")).strip()
    role = normalize_role(payload.get("role", ""))
    department_id = payload.get("department_id")
    branch_id = payload.get("branch_id")
    batch_id = payload.get("batch_id")
    new_password = str(payload.get("new_password", ""))
    confirm_password = str(payload.get("confirm_password", ""))
    faculty_name = str(payload.get("faculty_name", "")).strip()
    faculty_email = str(payload.get("faculty_email", "")).strip().lower()

    if not user_id:
        return cors_response({"success": False, "message": "User id is required."}, status=400)

    if not username or role not in {"student", "faculty"}:
        return cors_response({"success": False, "message": "Valid username and role are required."}, status=400)

    if new_password or confirm_password:
        if len(new_password) < 8:
            return cors_response({"success": False, "message": "Password must be at least 8 characters."}, status=400)
        if new_password != confirm_password:
            return cors_response({"success": False, "message": "Passwords do not match."}, status=400)

    try:
        target_user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return cors_response({"success": False, "message": "User not found."}, status=404)

    if target_user.username == MASTER_ADMIN_USERNAME:
        return cors_response({"success": False, "message": "Master admin cannot be edited here."}, status=400)

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

    if role == "faculty":
        if not faculty_name:
            faculty_name = username

        if not faculty_email:
            if "@" in username:
                faculty_email = username.lower()
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

        if role == "faculty":
            target_user.first_name = faculty_name
            target_user.email = faculty_email

        if new_password:
            target_user.set_password(new_password)
            target_user.save()
        else:
            update_fields = ["username", "first_name", "email"] if role == "faculty" else ["username"]
            target_user.save(update_fields=update_fields)

        target_user.groups.clear()
        role_group, _ = Group.objects.get_or_create(name=role)
        target_user.groups.add(role_group)

        profile.role = role
        profile.department = department
        profile.branch = branch if role == "student" else None
        profile.batch = batch if role == "student" else None
        profile.save(update_fields=["role", "department", "branch", "batch"])

        if old_role == "faculty" and role != "faculty" and old_email:
            Faculty.objects.filter(email__iexact=old_email).delete()

        if role == "faculty":
            faculty_record = faculty_record_for_old_email or Faculty.objects.filter(email__iexact=faculty_email).first()

            if faculty_record is None:
                Faculty.objects.create(name=faculty_name, email=faculty_email, department=department)
            else:
                faculty_record.name = faculty_name
                faculty_record.email = faculty_email
                faculty_record.department = department
                faculty_record.save(update_fields=["name", "email", "department"])

    return cors_response({"success": True, "message": "User updated successfully."})


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def delete_managed_user_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)

    admin_username, admin_password = parse_master_admin_credentials(payload)
    if not is_master_admin_credentials(admin_username, admin_password):
        return cors_response({"success": False, "message": "Only master admin can delete users."}, status=403)

    user_id = payload.get("user_id")
    if not user_id:
        return cors_response({"success": False, "message": "User id is required."}, status=400)

    try:
        target_user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return cors_response({"success": False, "message": "User not found."}, status=404)

    if target_user.username == MASTER_ADMIN_USERNAME:
        return cors_response({"success": False, "message": "Master admin cannot be deleted."}, status=400)

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
