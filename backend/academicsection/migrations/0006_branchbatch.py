from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('academicsection', '0005_department_hod'),
    ]

    operations = [
        migrations.CreateModel(
            name='BranchBatch',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('year', models.PositiveSmallIntegerField()),
                ('batch_name', models.CharField(max_length=30)),
                ('branch', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='academicsection.branch')),
            ],
            options={
                'unique_together': {('branch', 'year', 'batch_name')},
            },
        ),
    ]
