from decimal import Decimal

from django.db import migrations, models
from django.db.models import Sum


def backfill_accumulated_rewards(apps, schema_editor):
    Dashboard = apps.get_model('lotteryWeb', 'Dashboard')
    ScratchLottoOrder = apps.get_model('lotteryWeb', 'ScratchLottoOrder')
    SixLottoOrder = apps.get_model('lotteryWeb', 'SixLottoOrder')
    database = schema_editor.connection.alias

    for dashboard in Dashboard.objects.using(database).iterator():
        scratch_rewards = (
            ScratchLottoOrder.objects.using(database)
            .filter(user_id=dashboard.user_id, opened=True)
            .aggregate(total=Sum('prize_reward'))['total']
            or Decimal('0.00')
        )
        six_rewards = (
            SixLottoOrder.objects.using(database)
            .filter(user_id=dashboard.user_id, is_checked=True)
            .aggregate(total=Sum('prize_reward'))['total']
            or Decimal('0.00')
        )
        dashboard.accumulated_rewards = scratch_rewards + six_rewards
        dashboard.save(update_fields=['accumulated_rewards'])


class Migration(migrations.Migration):

    dependencies = [
        ('lotteryWeb', '0012_sixlottorounddraw_trans_date'),
    ]

    operations = [
        migrations.AddField(
            model_name='dashboard',
            name='accumulated_rewards',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
        migrations.RunPython(backfill_accumulated_rewards, migrations.RunPython.noop),
    ]
