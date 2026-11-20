from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('lotteryWeb', '0009_sixlottoorder_checked_date'),
    ]

    operations = [
        migrations.CreateModel(
            name='SixLottoRoundDraw',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('ranking', models.PositiveSmallIntegerField()),
                ('number_win', models.JSONField(default=list)),
                ('bonus_number', models.PositiveSmallIntegerField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('country', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='lotteryWeb.country')),
                ('purchase', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='six_lotto_draws', to='lotteryWeb.lotterypurchase')),
            ],
            options={
                'db_table': 'six_lotto_round_draw',
                'ordering': ['purchase_id', 'country_id', 'ranking'],
            },
        ),
        migrations.AddConstraint(
            model_name='sixlottorounddraw',
            constraint=models.UniqueConstraint(fields=('purchase', 'country', 'ranking'), name='unique_purchase_country_draw_rank'),
        ),
    ]
