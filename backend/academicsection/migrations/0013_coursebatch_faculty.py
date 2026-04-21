from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('academicsection', '0012_userprofile_roll_no'),
        ('faculty', '0002_faculty_profile_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='coursebatch',
            name='faculty',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='faculty.faculty'),
        ),
    ]