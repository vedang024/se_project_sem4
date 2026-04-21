from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('faculty', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='faculty',
            name='address',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='faculty',
            name='designation',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='faculty',
            name='experience',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name='faculty',
            name='honor',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='faculty',
            name='phone_number',
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name='faculty',
            name='research_area',
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
