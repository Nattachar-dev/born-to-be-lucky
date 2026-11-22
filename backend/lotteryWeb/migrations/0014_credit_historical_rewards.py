from decimal import Decimal

from django.db import migrations
from django.db.models import Sum


def credit_historical_rewards(apps, schema_editor):
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
        dashboard.total_wallet += dashboard.accumulated_rewards
        dashboard.accumulated_rewards = scratch_rewards + six_rewards
        dashboard.prize_accumulated = max(
            dashboard.prize_accumulated,
            dashboard.accumulated_rewards,
        )
        dashboard.save(update_fields=[
            'total_wallet', 'accumulated_rewards', 'prize_accumulated',
        ])


class Migration(migrations.Migration):

    dependencies = [
        ('lotteryWeb', '0013_dashboard_accumulated_rewards'),
    ]

    operations = [
        migrations.RunPython(credit_historical_rewards),
    ]
