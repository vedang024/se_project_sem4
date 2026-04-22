"""Shared applications API endpoints for admin, faculty, and student."""
from datetime import date, datetime
import json

from django.contrib.auth.models import User
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from academicsection.models import Course, CourseBatch, UserProfile
from faculty.models import Attendance
from student.models import AdminApplication, Application

VALID_ROLES = {"student", "faculty", "admin"}


def cors_response(payload, status=200):
    response = JsonResponse(payload, status=status)
    response["Access-Control-Allow-Origin"] = "*"
    response["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response["Access-Control-Allow-Headers"] = "Content-Type"
    return response


def normalize_erp_email(value):
    email = str(value or "").strip().lower()
    if email.endswith("@iiitm.ac.in"):
        local_part = email.split("@", 1)[0]
        return f"{local_part}@erp.ac.in"
    return email


def normalize_role(role):
    role = str(role or "").strip().lower()
    if role == "academic":
        return "admin"
    return role


def user_has_role(user, role):
    if role == "admin":
        return user.groups.filter(name__in=["admin", "academic"]).exists() or user.is_superuser
    return user.groups.filter(name=role).exists() or user.is_superuser


def to_iso_string(value):
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.replace(tzinfo=None).isoformat(timespec="seconds")
    return str(value)


def parse_payload(request):
    try:
        return json.loads(request.body.decode("utf-8")), None
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None, cors_response({"success": False, "message": "Invalid JSON payload."}, status=400)


def get_user_by_username(username):
    normalized = normalize_erp_email(username)
    raw_username = str(username or "").strip()
    if not normalized and not raw_username:
        return None
    return (
        User.objects.filter(username__iexact=normalized).first()
        or User.objects.filter(username__iexact=raw_username).first()
    )


def get_actor(payload):
    username = payload.get("requester_username") or payload.get("username") or payload.get("admin_username")
    role = payload.get("requester_role") or payload.get("role")
    if not role and payload.get("admin_username"):
        role = "admin"

    username = normalize_erp_email(username)
    role = normalize_role(role)

    if not username or role not in VALID_ROLES:
        return None

    user = get_user_by_username(username)
    if user is None or not user_has_role(user, role):
        return None

    profile = UserProfile.objects.select_related("department", "branch", "batch").filter(user=user).first()
    email = normalize_erp_email(user.email or user.username)
    return {
        "user": user,
        "role": role,
        "profile": profile,
        "username": normalize_erp_email(user.username),
        "email": email,
        "display_name": user.first_name or user.username,
    }


def get_actor_or_403(payload):
    actor = get_actor(payload)
    if actor is None:
        return None, cors_response({"success": False, "message": "Valid requester session is required."}, status=403)
    return actor, None


def get_role_label(role):
    return {
        "admin": "Academic Section",
        "faculty": "Faculty",
        "student": "Student",
    }.get(role, role.title())


def get_display_name_for_user(user):
    return (user.first_name or user.username or "").strip()


def get_display_name_for_recipient(email, role):
    user = User.objects.filter(username__iexact=email).first() or User.objects.filter(email__iexact=email).first()
    if user:
        return get_display_name_for_user(user)
    return get_role_label(role)


def get_student_profile_map(applications):
    roll_nos = [application.student.rollno for application in applications if getattr(application, "student", None)]
    profiles = UserProfile.objects.filter(role="student", roll_no__in=roll_nos).select_related("user", "department")
    return {str(profile.roll_no).strip().lower(): profile for profile in profiles}


def parse_student_application_type(raw_type):
    raw_type = str(raw_type or "").strip()
    parts = raw_type.split("|")
    if len(parts) == 3 and parts[0] == "ATTQ":
        return {
            "kind": "attendance_query",
            "course_id": parts[1],
            "missed_date": parts[2],
        }
    return {
        "kind": "student_application",
        "course_id": "",
        "missed_date": "",
    }


def get_student_query_receiver(application, profile=None):
    profile = profile or UserProfile.objects.filter(
        role="student",
        roll_no__iexact=application.student.rollno,
    ).select_related("user", "department", "batch").first()

    parsed_type = parse_student_application_type(application.type)
    if profile and profile.batch_id and parsed_type["course_id"]:
        course_batch = (
            CourseBatch.objects.select_related("faculty")
            .filter(batch_id=profile.batch_id, course_id=parsed_type["course_id"])
            .first()
        )
        if course_batch and course_batch.faculty:
            return {
                "receiver_name": course_batch.faculty.name,
                "receiver_email": normalize_erp_email(course_batch.faculty.email),
                "receiver_type": "faculty",
            }

    return {
        "receiver_name": "Faculty Not Assigned",
        "receiver_email": "",
        "receiver_type": "faculty",
    }


def serialize_message(app, full_message=False):
    return {
        "app_ref": f"message:{app.app_id}",
        "app_id": app.app_id,
        "record_type": "shared_message",
        "subject": app.subject,
        "sender_name": app.sender_name,
        "sender_email": app.sender_email,
        "sender_type": app.sender_type,
        "receiver_name": get_display_name_for_recipient(app.receiver_email, app.receiver_type),
        "receiver_email": app.receiver_email,
        "receiver_type": app.receiver_type,
        "message": app.message if full_message else (app.message[:140] if len(app.message) > 140 else app.message),
        "status": app.status,
        "created_at": to_iso_string(app.created_at),
        "updated_at": to_iso_string(app.updated_at),
    }


def serialize_student_query(application, profile=None, full_message=False):
    profile = profile or UserProfile.objects.filter(
        role="student",
        roll_no__iexact=application.student.rollno,
    ).select_related("user", "department").first()

    parsed_type = parse_student_application_type(application.type)
    course_name = ""
    if parsed_type["course_id"]:
        course = Course.objects.filter(course_id=parsed_type["course_id"]).first()
        course_name = course.course_name if course else ""

    sender_name = application.student.rollno
    sender_email = ""
    department = ""
    if profile:
        sender_name = profile.user.first_name or profile.user.username or sender_name
        sender_email = normalize_erp_email(profile.user.email or profile.user.username)
        department = profile.department.dept_name if profile.department else ""

    if parsed_type["kind"] == "attendance_query":
        subject = "Attendance Correction Request"
        message = (
            f"Attendance correction request for course {parsed_type['course_id']}"
            f"{f' ({course_name})' if course_name else ''} on {parsed_type['missed_date']}."
        )
        reason = str(getattr(application, "description", "") or "").strip()
        if reason:
            message = f"{message}\n\nStudent note: {reason}"
    else:
        subject = "Student Application"
        message = str(getattr(application, "description", "") or "").strip() or f"Student application reference: {application.type}"

    created_at = f"{application.submitted_date.isoformat()}T00:00:00"
    receiver_info = get_student_query_receiver(application, profile=profile)

    return {
        "app_ref": f"query:{application.application_id}",
        "app_id": application.application_id,
        "record_type": "student_query",
        "subject": subject,
        "sender_name": sender_name,
        "sender_email": sender_email,
        "sender_type": "student",
        "receiver_name": receiver_info["receiver_name"],
        "receiver_email": receiver_info["receiver_email"],
        "receiver_type": receiver_info["receiver_type"],
        "message": message if full_message else message,
        "status": application.status,
        "created_at": created_at,
        "updated_at": created_at,
        "course_id": parsed_type["course_id"],
        "course_name": course_name,
        "missed_date": parsed_type["missed_date"],
        "student_roll_no": application.student.rollno,
        "department": department,
        "raw_type": application.type,
    }


def normalize_recipients(payload):
    recipients = payload.get("recipients")
    if isinstance(recipients, list) and recipients:
        normalized = []
        for recipient in recipients:
            email = normalize_erp_email(recipient.get("email", ""))
            role = normalize_role(recipient.get("role", ""))
            if email and role in VALID_ROLES:
                normalized.append({"email": email, "role": role})
        return normalized

    receiver_emails = payload.get("receiver_emails", [])
    receiver_type = normalize_role(payload.get("receiver_type", ""))
    if isinstance(receiver_emails, list) and receiver_type in VALID_ROLES:
        return [
            {"email": normalize_erp_email(email), "role": receiver_type}
            for email in receiver_emails
            if normalize_erp_email(email)
        ]

    return []


def resolve_application_reference(app_ref):
    app_ref = str(app_ref or "").strip()
    if not app_ref:
        return None, None

    if app_ref.startswith("message:"):
        app_id = app_ref.split(":", 1)[1]
        return "shared_message", AdminApplication.objects.filter(app_id=app_id).first()

    if app_ref.startswith("query:"):
        app_id = app_ref.split(":", 1)[1]
        return "student_query", Application.objects.select_related("student").filter(application_id=app_id).first()

    if app_ref.isdigit():
        message = AdminApplication.objects.filter(app_id=app_ref).first()
        if message:
            return "shared_message", message
        query = Application.objects.select_related("student").filter(application_id=app_ref).first()
        if query:
            return "student_query", query

    return None, None


def can_view_message(actor, message):
    actor_email = actor["email"]
    return actor_email == normalize_erp_email(message.sender_email) or actor_email == normalize_erp_email(message.receiver_email)


def can_manage_message(actor, message):
    return actor["email"] == normalize_erp_email(message.receiver_email)


def can_delete_message(actor, message):
    return actor["email"] == normalize_erp_email(message.sender_email)


def can_view_student_query(actor, application):
    if actor["role"] == "faculty":
        receiver = get_student_query_receiver(application)
        return (
            receiver["receiver_type"] == "faculty"
            and normalize_erp_email(receiver["receiver_email"]) == actor["email"]
        )
    if actor["role"] != "student" or actor["profile"] is None:
        return False
    return str(actor["profile"].roll_no or "").strip().lower() == str(application.student.rollno).strip().lower()


def can_delete_student_query(actor, application):
    return can_view_student_query(actor, application) and actor["role"] == "student"


def can_manage_student_query(actor, application):
    if actor["role"] == "faculty":
        receiver = get_student_query_receiver(application)
        return (
            receiver["receiver_type"] == "faculty"
            and normalize_erp_email(receiver["receiver_email"]) == actor["email"]
        )
    return False


def create_response_message(actor, receiver_type, receiver_email, subject, message):
    if not receiver_email or not message:
        return
    AdminApplication.objects.create(
        subject=subject,
        sender_type=actor["role"],
        sender_name=actor["display_name"],
        sender_email=actor["email"],
        receiver_type=receiver_type,
        receiver_email=receiver_email,
        message=message,
        status="Sent",
    )


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def list_applications_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    payload, error = parse_payload(request)
    if error:
        return error

    actor, error = get_actor_or_403(payload)
    if error:
        return error

    view_type = str(payload.get("view_type", "inbox")).strip().lower()
    actor_email = actor["email"]

    if view_type == "sent":
        applications = AdminApplication.objects.filter(sender_email__iexact=actor_email).order_by("-created_at")
        apps_list = [serialize_message(app) for app in applications]
        if actor["role"] == "student" and actor["profile"] and actor["profile"].roll_no:
            student_queries = Application.objects.select_related("student").filter(
                student_id=actor["profile"].roll_no
            ).order_by("-submitted_date", "-application_id")
            apps_list.extend(serialize_student_query(application) for application in student_queries)
        apps_list.sort(key=lambda app: app["created_at"], reverse=True)
    else:
        applications = AdminApplication.objects.filter(receiver_email__iexact=actor_email).order_by("-created_at")
        apps_list = [serialize_message(app) for app in applications]
        if actor["role"] == "faculty":
            student_queries = list(
                Application.objects.select_related("student").order_by("-submitted_date", "-application_id")
            )
            profile_map = get_student_profile_map(student_queries)
            apps_list.extend(
                serialize_student_query(
                    application,
                    profile=profile_map.get(str(application.student.rollno).strip().lower()),
                )
                for application in student_queries
                if can_manage_student_query(actor, application)
            )
        apps_list.sort(key=lambda app: app["created_at"], reverse=True)

    return cors_response({
        "success": True,
        "applications": apps_list,
        "count": len(apps_list),
    })


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def get_application_detail_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    payload, error = parse_payload(request)
    if error:
        return error

    actor, error = get_actor_or_403(payload)
    if error:
        return error

    app_ref = payload.get("app_ref") or payload.get("app_id")
    if not app_ref:
        return cors_response({"success": False, "message": "Application reference is required."}, status=400)

    record_type, app = resolve_application_reference(app_ref)
    if app is None:
        return cors_response({"success": False, "message": "Application not found."}, status=404)

    if record_type == "student_query":
        if not can_view_student_query(actor, app):
            return cors_response({"success": False, "message": "You do not have access to this application."}, status=403)
        profile = UserProfile.objects.filter(
            role="student",
            roll_no__iexact=app.student.rollno,
        ).select_related("user", "department").first()
        application_payload = serialize_student_query(app, profile=profile, full_message=True)
    else:
        if not can_view_message(actor, app):
            return cors_response({"success": False, "message": "You do not have access to this application."}, status=403)
        application_payload = serialize_message(app, full_message=True)

    return cors_response({
        "success": True,
        "application": application_payload,
    })


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def send_application_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    payload, error = parse_payload(request)
    if error:
        return error

    actor, error = get_actor_or_403(payload)
    if error:
        return error

    subject = str(payload.get("subject", "")).strip()
    message = str(payload.get("message", "")).strip()
    recipients = normalize_recipients(payload)

    if not subject or not message:
        return cors_response({"success": False, "message": "Subject and message are required."}, status=400)
    if not recipients:
        return cors_response({"success": False, "message": "At least one recipient is required."}, status=400)

    created_count = 0
    invalid_recipients = []
    try:
        with transaction.atomic():
            for recipient in recipients:
                email = recipient["email"]
                role = recipient["role"]
                user = get_user_by_username(email)
                if user is None or not user_has_role(user, role):
                    invalid_recipients.append(email)
                    continue
                if normalize_erp_email(user.email or user.username) == actor["email"]:
                    continue
                AdminApplication.objects.create(
                    subject=subject,
                    sender_type=actor["role"],
                    sender_name=actor["display_name"],
                    sender_email=actor["email"],
                    receiver_type=role,
                    receiver_email=normalize_erp_email(user.email or user.username),
                    message=message,
                    status="Pending",
                )
                created_count += 1
    except Exception as exc:
        return cors_response(
            {"success": False, "message": f"Error sending applications: {str(exc)}"},
            status=500,
        )

    if created_count == 0:
        message = "No applications were sent."
        if invalid_recipients:
            message = f"No valid recipients found. Invalid recipients: {', '.join(invalid_recipients)}"
        return cors_response({"success": False, "message": message}, status=400)

    response_message = f"Application sent to {created_count} recipient(s)."
    if invalid_recipients:
        response_message += f" Skipped invalid recipients: {', '.join(invalid_recipients)}."

    return cors_response({
        "success": True,
        "message": response_message,
        "recipients_count": created_count,
    }, status=201)


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def respond_to_application_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    payload, error = parse_payload(request)
    if error:
        return error

    actor, error = get_actor_or_403(payload)
    if error:
        return error

    app_ref = payload.get("app_ref") or payload.get("app_id")
    status = str(payload.get("status", "")).strip()
    response_message = str(payload.get("response_message", "")).strip()

    if not app_ref:
        return cors_response({"success": False, "message": "Application reference is required."}, status=400)
    if status not in {"Approved", "Rejected", "Resolved"}:
        return cors_response({"success": False, "message": "Invalid status."}, status=400)

    record_type, app = resolve_application_reference(app_ref)
    if app is None:
        return cors_response({"success": False, "message": "Application not found."}, status=404)

    with transaction.atomic():
        if record_type == "student_query":
            if not can_manage_student_query(actor, app):
                return cors_response(
                    {"success": False, "message": "Only the assigned faculty can respond to this application."},
                    status=403,
                )
            parsed_type = parse_student_application_type(app.type)
            if status == "Approved" and parsed_type["kind"] == "attendance_query":
                try:
                    missed_date = date.fromisoformat(parsed_type["missed_date"])
                except ValueError:
                    missed_date = None
                if missed_date is not None:
                    Attendance.objects.filter(
                        student=app.student,
                        course_id=parsed_type["course_id"],
                        date=missed_date,
                    ).update(status="Present")

            app.status = status
            app.save(update_fields=["status"])

            if response_message:
                profile = UserProfile.objects.filter(
                    role="student",
                    roll_no__iexact=app.student.rollno,
                ).select_related("user").first()
                receiver_email = normalize_erp_email(profile.user.email or profile.user.username) if profile and profile.user else ""
                create_response_message(
                    actor,
                    "student",
                    receiver_email,
                    "Response to your attendance query",
                    response_message,
                )
        else:
            if not can_manage_message(actor, app):
                return cors_response({"success": False, "message": "Only the recipient can update this application."}, status=403)

            app.status = status
            app.updated_at = timezone.now()
            app.save(update_fields=["status", "updated_at"])

            if response_message:
                create_response_message(
                    actor,
                    app.sender_type,
                    normalize_erp_email(app.sender_email),
                    f"Re: {app.subject}",
                    response_message,
                )

    return cors_response({
        "success": True,
        "message": f"Application marked as {status}.",
    })


@csrf_exempt
@require_http_methods(["POST", "OPTIONS"])
def delete_application_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    payload, error = parse_payload(request)
    if error:
        return error

    actor, error = get_actor_or_403(payload)
    if error:
        return error

    app_ref = payload.get("app_ref") or payload.get("app_id")
    if not app_ref:
        return cors_response({"success": False, "message": "Application reference is required."}, status=400)

    record_type, app = resolve_application_reference(app_ref)
    if app is None:
        return cors_response({"success": False, "message": "Application not found."}, status=404)

    if record_type == "student_query":
        if not can_delete_student_query(actor, app):
            return cors_response({"success": False, "message": "Only the sender can remove this application."}, status=403)
        app.delete()
    else:
        if not can_delete_message(actor, app):
            return cors_response({"success": False, "message": "Only the sender can remove this application."}, status=403)
        app.delete()

    return cors_response({
        "success": True,
        "message": "Application removed successfully.",
    })


@csrf_exempt
@require_http_methods(["GET", "POST", "OPTIONS"])
def get_users_for_recipients_api(request):
    if request.method == "OPTIONS":
        return cors_response({"detail": "CORS preflight"})

    payload = {}
    if request.method == "POST":
        payload, error = parse_payload(request)
        if error:
            return error
    else:
        payload = {
            "requester_username": request.GET.get("requester_username", ""),
            "requester_role": request.GET.get("requester_role", ""),
        }

    actor, error = get_actor_or_403(payload)
    if error:
        return error

    actor_email = actor["email"]
    students = []
    faculty_users = []
    admin_users = []

    student_profiles = UserProfile.objects.filter(role="student").select_related("user", "department").order_by("user__first_name")
    for profile in student_profiles:
        email = normalize_erp_email(profile.user.email or profile.user.username)
        if not email or email == actor_email:
            continue
        students.append({
            "email": email,
            "name": profile.user.first_name or profile.user.username,
            "department": profile.department.dept_name if profile.department else "-",
            "roll_no": profile.roll_no or "-",
            "role": "student",
        })

    faculty_profiles = UserProfile.objects.filter(role="faculty").select_related("user", "department").order_by("user__first_name")
    for profile in faculty_profiles:
        email = normalize_erp_email(profile.user.email or profile.user.username)
        if not email or email == actor_email:
            continue
        faculty_users.append({
            "email": email,
            "name": profile.user.first_name or profile.user.username,
            "department": profile.department.dept_name if profile.department else "-",
            "role": "faculty",
        })

    admins = User.objects.filter(groups__name__in=["admin", "academic"]).distinct().order_by("first_name", "username")
    for admin in admins:
        email = normalize_erp_email(admin.email or admin.username)
        if not email or email == actor_email:
            continue
        admin_users.append({
            "email": email,
            "name": get_display_name_for_user(admin),
            "department": "Academic Section",
            "role": "admin",
        })

    return cors_response({
        "success": True,
        "students": students,
        "faculty": faculty_users,
        "admins": admin_users,
    })
