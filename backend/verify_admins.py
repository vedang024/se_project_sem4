#!/usr/bin/env python
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.contrib.auth.models import User, Group

# List all admins
admin_group = Group.objects.filter(name='admin').first()
if admin_group:
    print('\n=== Admin Users ===')
    admins = admin_group.user_set.all()
    print(f'Total admins: {admins.count()}')
    for admin in admins:
        is_master = admin.username == 'masterAdmin@erp.ac.in'
        print(f'  - {admin.username} (Master: {is_master}, Active: {admin.is_active})')
else:
    print('Admin group not found')

print('\n=== Testing Add Admin (using manage_admin command) ===')
import subprocess
result = subprocess.run(
    ['c:/Users/shrey/desktop/SE_lab/se_project_sem4/.venv/Scripts/python.exe', 
     'manage.py', 'manage_admin', 'add',
     '--email', 'admin1@erp.ac.in',
     '--password', 'Admin@123'],
    cwd='.',
    capture_output=True,
    text=True
)
print('STDOUT:', result.stdout)
if result.stderr:
    print('STDERR:', result.stderr)

# List admins again
print('\n=== Updated Admin List ===')
admin_group.refresh_from_db()
admins = admin_group.user_set.all()
print(f'Total admins: {admins.count()}')
for admin in admins:
    is_master = admin.username == 'masterAdmin@erp.ac.in'
    print(f'  - {admin.username} (Master: {is_master}, Active: {admin.is_active})')

print('\n')
