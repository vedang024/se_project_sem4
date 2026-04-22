import requests
import json

API_BASE = 'http://127.0.0.1:8000'

print('Testing get_users_for_recipients_api...')
response = requests.get(f'{API_BASE}/api/admin/recipients/')
print(f'Status: {response.status_code}')

if response.status_code == 200:
    data = response.json()
    students_count = len(data.get('students', []))
    faculty_count = len(data.get('faculty', []))
    print(f'Found {students_count} students and {faculty_count} faculty')
    print('API is working!')
else:
    print(f'Error: {response.text}')
