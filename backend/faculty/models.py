from django.db import models

# Create your models here.
class Faculty(models.Model):
    faculty_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    department = models.ForeignKey('academicsection.Department', on_delete=models.CASCADE)

class FacultyCourse(models.Model):
    faculty = models.ForeignKey('faculty.Faculty', on_delete=models.CASCADE)
    course = models.ForeignKey('academicsection.Course', on_delete=models.CASCADE)

    class Meta:
        unique_together = ('faculty', 'course')

class Attendance(models.Model):
    student = models.ForeignKey('student.Student', on_delete=models.CASCADE)
    course = models.ForeignKey('academicsection.Course', on_delete=models.CASCADE)
    date = models.DateField()
    status = models.CharField(
        max_length=10,
        choices=[('Present', 'Present'), ('Absent', 'Absent')]
    )

    class Meta:
        unique_together = ('student', 'course', 'date')

class Announcement(models.Model):
    announcement_id = models.AutoField(primary_key=True)
    course = models.ForeignKey('academicsection.Course', on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    content = models.TextField()
    date = models.DateField(auto_now_add=True)
    target_group = models.CharField(max_length=50)