from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academicsection', '0002_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='SharedTimetable',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('data', models.JSONField(blank=True, default=dict)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
        ),
    ]
