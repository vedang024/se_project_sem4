from django.db import models

# Create your models here.
class Department(models.Model):
    dept_id = models.AutoField(primary_key=True)
    dept_name = models.CharField(max_length=100)

class Branch(models.Model):
    branch_id = models.CharField(primary_key=True, max_length=10)
    branch_name = models.CharField(max_length=100)
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