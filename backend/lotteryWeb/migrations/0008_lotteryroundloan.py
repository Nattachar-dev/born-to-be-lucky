from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('lotteryWeb', '0007_sixlottoorder_result_fields'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='LotteryRoundLoan',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('round_number', models.PositiveIntegerField()),
                ('amount', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('is_applied', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lottery_round_loans', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'lottery_round_loan',
                'ordering': ['-round_number'],
            },
        ),
        migrations.AddConstraint(
            model_name='lotteryroundloan',
            constraint=models.UniqueConstraint(fields=('user', 'round_number'), name='unique_user_lottery_round_loan'),
        ),
    ]
