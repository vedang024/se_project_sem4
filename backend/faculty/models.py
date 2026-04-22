from django.db import models

# Create your models here.
class Faculty(models.Model):
    faculty_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    department = models.ForeignKey('academicsection.Department', on_delete=models.CASCADE)
    designation = models.CharField(max_length=100, blank=True)
    honor = models.CharField(max_length=100, blank=True)
    experience = models.CharField(max_length=50, blank=True)
    phone_number = models.CharField(max_length=20, blank=True)
    research_area = models.CharField(max_length=255, blank=True)
    address = models.CharField(max_length=255, blank=True)

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


class CourseAssessmentComponent(models.Model):
    component_id = models.AutoField(primary_key=True)
    batch = models.ForeignKey('academicsection.BranchBatch', on_delete=models.CASCADE, related_name='assessment_components')
    course = models.ForeignKey('academicsection.Course', on_delete=models.CASCADE, related_name='assessment_components')
    faculty = models.ForeignKey('faculty.Faculty', on_delete=models.CASCADE, related_name='assessment_components')
    title = models.CharField(max_length=100)
    component_type = models.CharField(max_length=30, default='assignment')
    max_marks = models.DecimalField(max_digits=7, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('batch', 'course', 'title')
        ordering = ['component_id']


class StudentAssessmentScore(models.Model):
    score_id = models.AutoField(primary_key=True)
    component = models.ForeignKey(CourseAssessmentComponent, on_delete=models.CASCADE, related_name='scores')
    student = models.ForeignKey('student.Student', on_delete=models.CASCADE, related_name='assessment_scores')
    marks_obtained = models.DecimalField(max_digits=7, decimal_places=2)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('component', 'student')


class CourseScoresheetSubmission(models.Model):
    submission_id = models.AutoField(primary_key=True)
    batch = models.ForeignKey('academicsection.BranchBatch', on_delete=models.CASCADE, related_name='scoresheet_submissions')
    course = models.ForeignKey('academicsection.Course', on_delete=models.CASCADE, related_name='scoresheet_submissions')
    faculty = models.ForeignKey('faculty.Faculty', on_delete=models.CASCADE, related_name='scoresheet_submissions')
    total_students = models.PositiveIntegerField(default=0)
    total_components = models.PositiveIntegerField(default=0)
    total_max_marks = models.DecimalField(max_digits=9, decimal_places=2, default=0)
    average_score = models.DecimalField(max_digits=9, decimal_places=2, default=0)
    average_percentage = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    message_count = models.PositiveIntegerField(default=0)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-submitted_at']
