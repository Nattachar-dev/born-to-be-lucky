from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('lotteryWeb', '0010_sixlottorounddraw'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='sixlottogen',
            name='unique_country_daily_draw',
        ),
        migrations.AddField(
            model_name='sixlottogen',
            name='id_set',
            field=models.PositiveSmallIntegerField(default=1),
        ),
        migrations.AddField(
            model_name='sixlottorounddraw',
            name='id_set',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AlterModelOptions(
            name='sixlottogen',
            options={'ordering': ['-trans_date', 'id_set', 'country_id', 'ranking']},
        ),
        migrations.AddConstraint(
            model_name='sixlottogen',
            constraint=models.UniqueConstraint(
                fields=('country', 'trans_date', 'id_set', 'ranking'),
                name='unique_country_daily_set_rank',
            ),
        ),
    ]
