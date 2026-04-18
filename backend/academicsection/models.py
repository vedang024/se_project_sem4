from django.db import models
from django.contrib.auth.models import User

# Create your models here.
class Department(models.Model):
    dept_id = models.AutoField(primary_key=True)
    dept_name = models.CharField(max_length=100)
    hod = models.ForeignKey('faculty.Faculty', on_delete=models.SET_NULL, null=True, blank=True, related_name='headed_departments')

class Branch(models.Model):
    branch_id = models.CharField(primary_key=True, max_length=10)
    branch_name = models.CharField(max_length=100)
    college_years = models.PositiveSmallIntegerField(default=4)
    department = models.ForeignKey(Department, on_delete=models.CASCADE)

class Course(models.Model):
    course_id = models.CharField(primary_key=True, max_length=10)
    course_name = models.CharField(max_length=100)
    credits = models.IntegerField()
    department = models.ForeignKey(Department, on_delete=models.CASCADE)

class Monday(models.Model):
    branch_id = models.OneToOneField(Branch, on_delete=models.CASCADE)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    faculty = models.ForeignKey('faculty.Faculty', on_delete=models.CASCADE)
    time_slot = models.CharField(max_length=20)
    room = models.CharField(max_length=20)

    class Meta:
        unique_together = ('branch_id', 'time_slot')

class Tuesday(models.Model):
    branch_id = models.OneToOneField(Branch, on_delete=models.CASCADE)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    faculty = models.ForeignKey('faculty.Faculty', on_delete=models.CASCADE)
    time_slot = models.CharField(max_length=20)
    room = models.CharField(max_length=20)

    class Meta:
        unique_together = ('branch_id', 'time_slot')

class Wednesday(models.Model):
    branch_id = models.OneToOneField(Branch, on_delete=models.CASCADE)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    faculty = models.ForeignKey('faculty.Faculty', on_delete=models.CASCADE)
    time_slot = models.CharField(max_length=20)
    room = models.CharField(max_length=20)

    class Meta:
        unique_together = ('branch_id', 'time_slot')

class Thursday(models.Model):
    branch_id = models.OneToOneField(Branch, on_delete=models.CASCADE)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    faculty = models.ForeignKey('faculty.Faculty', on_delete=models.CASCADE)
    time_slot = models.CharField(max_length=20)
    room = models.CharField(max_length=20)

    class Meta:
        unique_together = ('branch_id', 'time_slot')

class Friday(models.Model):
    branch_id = models.OneToOneField(Branch, on_delete=models.CASCADE)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    faculty = models.ForeignKey('faculty.Faculty', on_delete=models.CASCADE)
    time_slot = models.CharField(max_length=20)
    room = models.CharField(max_length=20)

    class Meta:
        unique_together = ('branch_id', 'time_slot')

class Saturday(models.Model):
    branch_id = models.OneToOneField(Branch, on_delete=models.CASCADE)
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    faculty = models.ForeignKey('faculty.Faculty', on_delete=models.CASCADE)
    time_slot = models.CharField(max_length=20)
    room = models.CharField(max_length=20)

    class Meta:
        unique_together = ('branch_id', 'time_slot')


class SharedTimetable(models.Model):
    data = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    role = models.CharField(max_length=20)
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True)
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True)
    batch = models.ForeignKey('academicsection.BranchBatch', on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['role']),
        ]


class BranchBatch(models.Model):
    branch = models.ForeignKey(Branch, on_delete=models.CASCADE)
    year = models.PositiveSmallIntegerField()
    college_year = models.PositiveSmallIntegerField(default=1)
    batch_name = models.CharField(max_length=30)

    class Meta:
        unique_together = ('branch', 'year', 'batch_name')