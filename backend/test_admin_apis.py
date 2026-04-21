#!/usr/bin/env python
import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.test.client import RequestFactory
import json
from backend.views import login_api, list_admins_api, add_admin_api

rf = RequestFactory()

# Test 1: Master admin login
print('\n=== TEST 1: Master Admin Login ===')
login_payload = {
    'username': 'masterAdmin@erp.ac.in',
    'password': 'masterAdmin@123',
    'role': 'admin'
}
req = rf.post('/api/login/', data=json.dumps(login_payload), content_type='application/json')
res = login_api(req)
data = json.loads(res.content.decode())
print(f'Login Success: {data.get("success")}')
print(f'Message: {data.get("message")}')
print(f'User: {data.get("user", {})}')

# Test 2: List admins
print('\n=== TEST 2: List Admins ===')
admin_payload = {
    'admin_username': 'masterAdmin@erp.ac.in',
    'admin_password': 'masterAdmin@123',
}
req = rf.post('/api/admin/admins/list/', data=json.dumps(admin_payload), content_type='application/json')
res = list_admins_api(req)
data = json.loads(res.content.decode())
print(f'Success: {data.get("success")}')
print(f'Total Admins: {data.get("total", 0)}')
admins = data.get('admins', [])
if admins:
    print('Admins:')
    for admin in admins:
        print(f'  - {admin.get("username")} (Master: {admin.get("is_master_admin")}, Active: {admin.get("is_active")})')

# Test 3: Add a new admin
print('\n=== TEST 3: Add New Admin (test_admin@erp.ac.in) ===')
add_payload = {
    'admin_username': 'masterAdmin@erp.ac.in',
    'admin_password': 'masterAdmin@123',
    'admin_email': 'test_admin@erp.ac.in',
    'admin_password': 'TestAdmin@123',
}
req = rf.post('/api/admin/admins/add/', data=json.dumps(add_payload), content_type='application/json')
res = add_admin_api(req)
data = json.loads(res.content.decode())
print(f'Success: {data.get("success")}')
print(f'Message: {data.get("message")}')
if data.get('admin'):
    print(f'Created Admin: {data.get("admin").get("username")}')

print('\n=== All Tests Completed ===\n')
