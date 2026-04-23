from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("student", "0003_application_description"),
    ]

    operations = [
        migrations.AddField(
            model_name="application",
            name="submitted_at",
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
    ]
