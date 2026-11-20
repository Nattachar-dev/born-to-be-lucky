from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('lotteryWeb', '0006_lotterypurchase_scratchlottoorder_sixlottogen_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='sixlottoorder',
            name='is_checked',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='sixlottoorder',
            name='prize_rank',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='sixlottoorder',
            name='bonus_match',
            field=models.BooleanField(default=False),
        ),
    ]
