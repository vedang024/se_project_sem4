from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('academicsection', '0011_coursebatch'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='roll_no',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
    ]
