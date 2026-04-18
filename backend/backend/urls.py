"""
URL configuration for backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path
from .views import (
    create_department_api,
    create_department_course_api,
    create_department_faculty_api,
    create_branch_batch_api,
    create_branch_api,
    create_user_api,
    delete_managed_user_api,
    faculty_options_api,
    get_branch_batch_detail_api,
    get_department_detail_api,
    get_departments_branches_api,
    get_timetable_api,
    list_departments_api,
    list_branch_batches_api,
    list_managed_users_api,
    login_api,
    delete_branch_batch_api,
    save_timetable_api,
    update_managed_user_api,
    update_branch_api,
    update_branch_batch_api,
    update_department_api,
)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/login/', login_api, name='login_api'),
    path('api/admin/create-user/', create_user_api, name='create_user_api'),
    path('api/admin/departments/', list_departments_api, name='list_departments_api'),
    path('api/admin/departments/<int:department_id>/', get_department_detail_api, name='get_department_detail_api'),
    path('api/admin/departments/create/', create_department_api, name='create_department_api'),
    path('api/admin/departments/faculty/create/', create_department_faculty_api, name='create_department_faculty_api'),
    path('api/admin/departments/courses/create/', create_department_course_api, name='create_department_course_api'),
    path('api/admin/departments/update/', update_department_api, name='update_department_api'),
    path('api/admin/branches/create/', create_branch_api, name='create_branch_api'),
    path('api/admin/branches/update/', update_branch_api, name='update_branch_api'),
    path('api/admin/branches/batches/create/', create_branch_batch_api, name='create_branch_batch_api'),
    path('api/admin/branches/batches/update/', update_branch_batch_api, name='update_branch_batch_api'),
    path('api/admin/branches/batches/delete/', delete_branch_batch_api, name='delete_branch_batch_api'),
    path('api/admin/branch-batches/', list_branch_batches_api, name='list_branch_batches_api'),
    path('api/admin/branch-batches/<int:batch_id>/', get_branch_batch_detail_api, name='get_branch_batch_detail_api'),
    path('api/admin/faculty-options/', faculty_options_api, name='faculty_options_api'),
    path('api/admin/departments-branches/', get_departments_branches_api, name='get_departments_branches_api'),
    path('api/admin/manage-users/', list_managed_users_api, name='list_managed_users_api'),
    path('api/admin/manage-users/update/', update_managed_user_api, name='update_managed_user_api'),
    path('api/admin/manage-users/delete/', delete_managed_user_api, name='delete_managed_user_api'),
    path('api/timetable/', get_timetable_api, name='get_timetable_api'),
    path('api/timetable/save/', save_timetable_api, name='save_timetable_api'),
]
