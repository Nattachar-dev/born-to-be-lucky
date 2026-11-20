from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('lotteryWeb', '0008_lotteryroundloan'),
    ]

    operations = [
        migrations.AddField(
            model_name='sixlottoorder',
            name='checked_date',
            field=models.DateField(blank=True, null=True),
        ),
    ]
