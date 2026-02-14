from django.db import models

# Create your models here.
class Student(models.Model):
    rollno = models.CharField(max_length=12, primary_key=True)
    semester = models.IntegerField()
    dob = models.DateField()
    phone = models.CharField(max_length=10)
    address = models.CharField(max_length=100)
    sex = models.CharField(max_length=10)
    religion = models.CharField(max_length=10)
    category = models.CharField(max_length=20)
    familyincome = models.CharField(max_length=10)
    abcid = models.CharField(max_length=12)
    cgpa = models.CharField(max_length = 5)

class Bank(models.Model):
    rollno = models.OneToOneField(Student, on_delete=models.CASCADE)
    acno = models.CharField(primary_key=True, max_length=18)
    ifsc = models.CharField(max_length=11)
    branchname = models.CharField(max_length=20)
    branchaddress = models.CharField(max_length=100)

class StudentCourse(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    course = models.ForeignKey('academicsection.Course', on_delete=models.CASCADE)
    semester = models.IntegerField()
    grade = models.CharField(max_length=2)

    class Meta:
        unique_together = ('student', 'course')

class Application(models.Model):
    application_id = models.AutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    type = models.CharField(max_length=50)
    status = models.CharField(max_length=20)
    submitted_date = models.DateField(auto_now_add=True)


