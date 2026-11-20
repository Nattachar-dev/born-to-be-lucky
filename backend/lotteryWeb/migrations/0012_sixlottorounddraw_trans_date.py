from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('lotteryWeb', '0011_sixlotto_reward_sets'),
    ]

    operations = [
        migrations.AddField(
            model_name='sixlottorounddraw',
            name='trans_date',
            field=models.DateField(blank=True, null=True),
        ),
    ]
