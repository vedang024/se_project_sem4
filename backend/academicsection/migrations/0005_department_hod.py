from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('academicsection', '0004_userprofile'),
        ('faculty', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='department',
            name='hod',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='headed_departments', to='faculty.faculty'),
        ),
    ]
