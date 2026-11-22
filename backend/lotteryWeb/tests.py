from collections import Counter
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient, APIRequestFactory

from .models import (
    Country,
    Dashboard,
    LotteryPurchase,
    LotteryRoundLoan,
    LotteryRule,
    ScratchLottoGen,
    ScratchLottoOrder,
    SixLottoGen,
    SixLottoOrder,
    SixLottoRoundDraw,
)
from .views import guide_countries


class GuideCountriesTests(TestCase):
    def test_returns_countries_and_lottery_rules_ordered_by_country_name(self):
        japan = Country.objects.create(code='JP', name='Japan', currency='JPY')
        korea = Country.objects.create(code='KR', name='Korea', currency='KRW')
        LotteryRule.objects.create(
            country=japan,
            game_type='loto6',
            title='LOTO 6',
            ticket_price='200',
            description='Choose six numbers.',
            rules=['Choose six numbers from the available range.'],
            prize_structure=[{'label': 'First prize', 'amount': 'JPY 1000'}],
        )
        LotteryRule.objects.create(
            country=korea,
            game_type='scratch',
            title='Scratch lottery',
            ticket_price='1000',
        )

        response = guide_countries(APIRequestFactory().get('/api/guideCountries/all/'))

        self.assertEqual(response.status_code, 200)
        countries = response.data['countries']
        self.assertEqual([country['name'] for country in countries], ['Japan', 'Korea'])
        self.assertEqual(countries[0]['guides'][0]['title'], 'LOTO 6')
        self.assertEqual(countries[0]['guides'][0]['price'], '200.00')
        self.assertEqual(
            countries[0]['guides'][0]['rewards'],
            [{'label': 'First prize', 'prize_reward': 'JPY 1000'}],
        )


class AuthenticationEndpointTests(TestCase):
    def test_create_user_accepts_username_and_returns_token(self):
        response = APIClient().post(
            '/api/createuser/',
            {'username': 'lucky-player', 'password': 'lottery-pass-123'},
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['username'], 'lucky-player')
        self.assertTrue(response.data['token'])

    def test_login_and_token_authenticated_logout(self):
        client = APIClient()
        client.post(
            '/api/createuser/',
            {'username': 'lucky-player', 'password': 'lottery-pass-123'},
        )

        login_response = client.post(
            '/api/auth/login/',
            {'username': 'lucky-player', 'password': 'lottery-pass-123'},
        )
        self.assertEqual(login_response.status_code, 200)
        self.assertFalse(login_response.data['is_staff'])

        token = login_response.data['token']
        client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        logout_response = client.post('/api/auth/logout/')

        self.assertEqual(logout_response.status_code, 204)
        self.assertFalse(Token.objects.filter(key=token).exists())

    def test_staff_login_returns_staff_status(self):
        admin = get_user_model().objects.create_user(
            username='admin-player',
            password='admin-pass-12345',
            is_staff=True,
        )
        response = APIClient().post(
            '/api/auth/login/',
            {'username': admin.username, 'password': 'admin-pass-12345'},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['is_staff'])


class SimulatorApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='simulator-player',
            password='simulator-pass-123',
        )
        self.dashboard = Dashboard.objects.create(user=self.user, total_wallet='500.00')
        self.country = Country.objects.create(code='JP', name='Japan', currency='JPY')
        LotteryRule.objects.create(
            country=self.country,
            game_type='scratch',
            title='Scratch lottery',
            ticket_price='100.00',
        )
        self.cards = [
            ScratchLottoGen.objects.create(
                country=self.country,
                card_code=f'JP-SCRATCH-{index:03}',
                card_symbols=['leaf', 'coin'],
                card_win={'is_winner': 0},
            )
            for index in range(1, 3)
        ]
        self.client = APIClient()
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_guest_simulator_returns_zero_account_values(self):
        response = APIClient().get('/api/simulator/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['wallet'], '0.00')
        self.assertEqual(response.data['prize_accumulated'], '0.00')
        self.assertEqual(response.data['accumulated_rewards'], '0.00')
        self.assertEqual(response.data['loan_amount'], '0.00')
        self.assertEqual(response.data['countries'][0]['games'][0]['price'], '0.00')
        self.assertEqual(response.data['countries'][0]['scratch_cards_available'], 0)

    def test_guest_cannot_borrow_or_purchase(self):
        client = APIClient()

        borrow_response = client.post('/api/borrow/')
        purchase_response = client.post(
            '/api/purchase/lottery/',
            {'items': [{'country_id': self.country.id, 'game_type': 'scratch', 'quantity': 1}]},
            format='json',
        )

        self.assertEqual(borrow_response.status_code, 401)
        self.assertEqual(purchase_response.status_code, 401)

    def test_authenticated_simulator_returns_dashboard_values(self):
        response = self.client.get('/api/simulator/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['wallet'], '500.00')
        self.assertEqual(response.data['base_wallet'], '500.00')
        self.assertEqual(response.data['loan_amount'], '2000.00')
        self.assertFalse(response.data['loan_used'])
        self.assertEqual(response.data['countries'][0]['scratch_cards_available'], 50)

    def test_authenticated_simulator_keeps_games_available_with_empty_wallet(self):
        self.dashboard.total_wallet = '0.00'
        self.dashboard.save(update_fields=['total_wallet'])

        response = self.client.get('/api/simulator/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['wallet'], '0.00')
        self.assertEqual(len(response.data['countries']), 1)
        self.assertEqual(response.data['countries'][0]['games'][0]['type'], 'scratch')
        self.assertEqual(response.data['countries'][0]['games'][0]['price'], '100.00')

    def test_simulator_uses_wallet_without_adding_historical_rewards(self):
        self.dashboard.accumulated_rewards = '350.00'
        self.dashboard.save(update_fields=['accumulated_rewards'])

        response = self.client.get('/api/simulator/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['base_wallet'], '500.00')
        self.assertEqual(response.data['accumulated_rewards'], '350.00')
        self.assertEqual(response.data['wallet'], '500.00')

    def test_purchase_does_not_add_historical_rewards_again(self):
        self.dashboard.total_wallet = '800.00'
        self.dashboard.accumulated_rewards = '300.00'
        self.dashboard.save(update_fields=['total_wallet', 'accumulated_rewards'])

        purchase = self.client.post(
            '/api/purchase/lottery/',
            {'items': [{'country_id': self.country.id, 'game_type': 'scratch', 'quantity': 8}]},
            format='json',
        )
        self.dashboard.refresh_from_db()
        next_purchase = self.client.post(
            '/api/purchase/lottery/',
            {'items': [{'country_id': self.country.id, 'game_type': 'scratch', 'quantity': 1}]},
            format='json',
        )

        self.assertEqual(purchase.status_code, 200)
        self.assertEqual(purchase.data['dashboard']['total_wallet'], '0.00')
        self.assertEqual(purchase.data['dashboard']['accumulated_rewards'], '300.00')
        self.assertEqual(str(self.dashboard.total_wallet), '0.00')
        self.assertEqual(str(self.dashboard.accumulated_rewards), '300.00')
        self.assertEqual(next_purchase.status_code, 409)

    def test_simulator_generates_50_cards_with_only_the_three_prize_tiers(self):
        ScratchLottoGen.objects.all().delete()

        response = self.client.get('/api/simulator/')
        cards = list(ScratchLottoGen.objects.all())
        tiers = [card.card_win['is_winner'] for card in cards]

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(cards), 50)
        self.assertEqual(Counter(tiers), {0: 32, 1: 3, 2: 5, 3: 10})

        first_prize = next(card for card in cards if card.card_win['is_winner'] == 1)
        self.assertEqual(first_prize.card_symbols.count('💰'), 2)
        self.assertEqual(first_prize.card_win['symbols_won'], ['💰'])

        second_prize = next(card for card in cards if card.card_win['is_winner'] == 2)
        self.assertNotIn('💰', second_prize.card_win['symbols_won'])
        self.assertEqual(second_prize.card_symbols.count(second_prize.card_win['symbols_won'][0]), 2)

        third_prize = next(card for card in cards if card.card_win['is_winner'] == 3)
        counts = Counter(third_prize.card_symbols)
        self.assertEqual(sum(count == 2 for count in counts.values()), 2)

    def test_borrow_adds_round_wallet_without_updating_dashboard_until_purchase(self):
        response = self.client.post('/api/borrow/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['loan_amount'], '2000.00')
        self.assertEqual(response.data['wallet'], '2500.00')
        self.assertEqual(response.data['dashboard']['total_wallet'], '500.00')
        self.assertEqual(response.data['dashboard']['total_borrowed'], '0.00')
        self.assertEqual(response.data['dashboard']['borrow_count'], 0)
        self.assertEqual(LotteryRoundLoan.objects.count(), 1)

        duplicate = self.client.post('/api/borrow/')
        simulator = self.client.get('/api/simulator/')

        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(simulator.data['wallet'], '2500.00')
        self.assertTrue(simulator.data['loan_used'])
        self.dashboard.refresh_from_db()
        self.assertEqual(str(self.dashboard.total_wallet), '500.00')

    def test_purchase_applies_round_loan_only_after_order_succeeds(self):
        LotteryRule.objects.create(
            country=self.country,
            game_type='loto6',
            title='LOTO 6',
            ticket_price='2400.00',
        )
        self.client.post('/api/borrow/')

        response = self.client.post(
            '/api/purchase/lottery/',
            {'items': [{'country_id': self.country.id, 'game_type': 'loto6', 'quantity': 1}]},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['dashboard']['total_wallet'], '100.00')
        self.assertEqual(response.data['dashboard']['total_borrowed'], '2000.00')
        self.assertEqual(response.data['dashboard']['borrow_count'], 1)
        self.dashboard.refresh_from_db()
        self.assertEqual(str(self.dashboard.total_wallet), '100.00')
        self.assertTrue(LotteryRoundLoan.objects.get().is_applied)

    def test_failed_purchase_does_not_apply_round_loan(self):
        LotteryRule.objects.create(
            country=self.country,
            game_type='loto6',
            title='LOTO 6',
            ticket_price='3000.00',
        )
        self.client.post('/api/borrow/')

        response = self.client.post(
            '/api/purchase/lottery/',
            {'items': [{'country_id': self.country.id, 'game_type': 'loto6', 'quantity': 1}]},
            format='json',
        )

        self.assertEqual(response.status_code, 409)
        self.dashboard.refresh_from_db()
        round_loan = LotteryRoundLoan.objects.get()
        self.assertEqual(str(self.dashboard.total_wallet), '500.00')
        self.assertEqual(str(self.dashboard.total_borrowed), '0.00')
        self.assertFalse(round_loan.is_applied)

    def test_purchase_rejects_insufficient_funds_without_consuming_cards(self):
        self.dashboard.total_wallet = '50.00'
        self.dashboard.save(update_fields=['total_wallet'])

        response = self.client.post(
            '/api/purchase/lottery/',
            {'items': [{'country_id': self.country.id, 'game_type': 'scratch', 'quantity': 1}]},
            format='json',
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(ScratchLottoGen.objects.filter(is_available=True).count(), 2)

    def test_purchase_consumes_scratch_cards_and_debits_wallet(self):
        response = self.client.post(
            '/api/purchase/lottery/',
            {'items': [{'country_id': self.country.id, 'game_type': 'scratch', 'quantity': 2}]},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_cost'], '200.00')
        self.assertEqual(response.data['dashboard']['total_wallet'], '300.00')
        self.assertEqual(len(response.data['cards']), 2)
        self.assertEqual(ScratchLottoGen.objects.filter(is_available=True).count(), 48)

    def test_wallet_balance_persists_after_700_purchase_and_simulator_reload(self):
        self.dashboard.total_wallet = '1000.00'
        self.dashboard.save(update_fields=['total_wallet'])

        purchase = self.client.post(
            '/api/purchase/lottery/',
            {'items': [{'country_id': self.country.id, 'game_type': 'scratch', 'quantity': 7}]},
            format='json',
        )
        simulator = self.client.get('/api/simulator/')

        self.assertEqual(purchase.status_code, 200)
        self.assertEqual(purchase.data['total_cost'], '700.00')
        self.assertEqual(purchase.data['dashboard']['total_wallet'], '300.00')
        self.assertEqual(simulator.status_code, 200)
        self.assertEqual(simulator.data['wallet'], '300.00')
        self.assertEqual(simulator.data['base_wallet'], '300.00')

    def test_purchase_generates_additional_cards_for_quantity_over_50(self):
        self.dashboard.total_wallet = '10000.00'
        self.dashboard.save(update_fields=['total_wallet'])
        self.client.get('/api/simulator/')

        response = self.client.post(
            '/api/purchase/lottery/',
            {'items': [{'country_id': self.country.id, 'game_type': 'scratch', 'quantity': 60}]},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['cards']), 60)
        self.assertEqual(response.data['dashboard']['total_wallet'], '4000.00')
        self.assertEqual(ScratchLottoGen.objects.filter(is_available=True).count(), 0)

    def test_purchase_creates_six_lotto_entries_and_records_purchase(self):
        self.dashboard.rounds_played = 6
        self.dashboard.save(update_fields=['rounds_played'])
        LotteryRule.objects.create(
            country=self.country,
            game_type='loto6',
            title='LOTO 6',
            ticket_price='200.00',
        )
        response = self.client.post(
            '/api/purchase/lottery/',
            {'items': [{'country_id': self.country.id, 'game_type': 'loto6', 'quantity': 1}]},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_cost'], '200.00')
        self.assertEqual(response.data['round_number'], 7)
        self.assertEqual(len(response.data['six_tickets']), 1)
        self.assertEqual(SixLottoOrder.objects.count(), 1)
        self.assertEqual(LotteryPurchase.objects.count(), 1)
        self.assertEqual(LotteryPurchase.objects.first().orders[0]['selected_number'], 1)
        self.dashboard.refresh_from_db()
        self.assertEqual(str(self.dashboard.total_wallet), '300.00')
        self.assertEqual(self.dashboard.rounds_played, 7)

    def test_open_scratch_ticket_saves_result_and_orders_are_private(self):
        scratch_rule = LotteryRule.objects.get(country=self.country, game_type='scratch')
        scratch_rule.prize_structure = [{'label': 'First', 'amount': '100.00'}]
        scratch_rule.save(update_fields=['prize_structure'])
        card = ScratchLottoGen.objects.create(
            country=self.country,
            card_code='JP-SCRATCH-OPEN',
            card_symbols=['coin', 'coin', 'leaf', 'star', 'bell', 'cherry'],
            card_win={'is_winner': 1, 'symbols_won': ['coin']},
            is_available=False,
        )
        purchase = LotteryPurchase.objects.create(
            user=self.user,
            round_number=1,
            total_cost='100.00',
            orders=[],
        )
        ticket = ScratchLottoOrder.objects.create(
            user=self.user,
            order=purchase,
            country=self.country,
            scratch_card=card,
        )

        unopened_orders = self.client.get('/api/orders/simulator-player/')
        opened = self.client.post(
            '/api/open/scratchlotto/',
            {'scratch_order_id': ticket.pk},
            format='json',
        )
        opened_again = self.client.post(
            '/api/open/scratchlotto/',
            {'scratch_order_id': ticket.pk},
            format='json',
        )
        orders = self.client.get('/api/orders/simulator-player/')
        other_user_orders = self.client.get('/api/orders/someone-else/')

        self.assertEqual(unopened_orders.status_code, 200)
        self.assertEqual(
            unopened_orders.data['purchases'][0]['scratch_tickets'][0]['target_symbols'],
            ['coin'],
        )
        self.assertEqual(
            unopened_orders.data['purchases'][0]['scratch_tickets'][0]['symbols'],
            card.card_symbols,
        )
        self.assertEqual(opened.status_code, 200)
        self.assertTrue(opened.data['ticket']['opened'])
        self.assertEqual(opened.data['ticket']['matches'], 2)
        self.assertEqual(opened.data['ticket']['prize_reward'], '100.00')
        self.assertEqual(opened_again.status_code, 200)
        self.dashboard.refresh_from_db()
        self.assertEqual(str(self.dashboard.accumulated_rewards), '100.00')
        self.assertEqual(str(self.dashboard.total_wallet), '600.00')
        self.assertEqual(self.client.get('/api/simulator/').data['wallet'], '600.00')
        self.assertEqual(orders.status_code, 200)
        self.assertEqual(orders.data['purchases'][0]['scratch_tickets'][0]['id'], ticket.pk)
        self.assertEqual(other_user_orders.status_code, 403)

    def test_save_and_check_six_lotto_selection_uses_standard_match_tiers(self):
        rule = LotteryRule.objects.create(
            country=self.country,
            game_type='loto6',
            title='LOTO 6',
            ticket_price='200.00',
            prize_structure=[
                {'label': 'First', 'amount': '1000'},
                {'label': 'Second', 'amount': '500'},
                {'label': 'Third', 'amount': '250'},
                {'label': 'Fourth', 'amount': '100'},
                {'label': 'Fifth', 'amount': '50'},
            ],
        )
        purchase = LotteryPurchase.objects.create(
            user=self.user,
            round_number=1,
            total_cost=rule.ticket_price,
            orders=[],
        )
        ticket = SixLottoOrder.objects.create(
            user=self.user,
            order=purchase,
            country=self.country,
        )
        for id_set in range(1, 11):
            for ranking in range(1, 6):
                SixLottoGen.objects.create(
                    country=self.country,
                    trans_date=timezone.localdate(),
                    id_set=id_set,
                    ranking=ranking,
                    number_win=[1, 2, 3, 4, 5, 6] if ranking == 1 else [10, 11, 12, 13, 14, 15],
                    bonus_number=7 if ranking == 1 else 16,
                )

        saved = self.client.post(
            '/api/save/sixlotto/',
            {'six_order_id': ticket.pk, 'number_selected': [1, 2, 3, 4, 5, 7]},
            format='json',
        )
        checked = self.client.post(f'/api/check/reward/sixlotto/{self.user.username}/')
        summary = self.client.get('/api/result/summary/')
        checked_again = self.client.post(f'/api/check/reward/sixlotto/{self.user.username}/')

        self.assertEqual(saved.status_code, 200)
        self.assertTrue(saved.data['ticket']['is_saved'])
        self.assertEqual(checked.status_code, 200)
        self.assertIn(checked.data['id_set'], range(1, 11))
        self.assertEqual(checked.data['results'][0]['prize_rank'], 2)
        self.assertEqual(checked.data['results'][0]['matches'], 5)
        self.assertEqual(checked.data['results'][0]['prize_reward'], '500.00')
        self.assertEqual(checked.data['results'][0]['checked_date'], timezone.localdate().isoformat())
        self.assertEqual(summary.data['summary'][0]['status'], 'won')
        self.assertEqual(summary.data['summary'][0]['number_selected'], [1, 2, 3, 4, 5, 7])
        self.assertEqual(summary.data['summary'][0]['checked_date'], timezone.localdate().isoformat())
        self.assertEqual(summary.data['total_cost'], '200.00')
        self.assertEqual(
            set(purchase.six_lotto_draws.values_list('id_set', flat=True)),
            {checked.data['id_set']},
        )
        self.assertEqual(checked_again.status_code, 200)
        self.assertEqual(checked_again.data['results'][0]['prize_rank'], 2)
        self.dashboard.refresh_from_db()
        self.assertEqual(str(self.dashboard.accumulated_rewards), '500.00')
        self.assertEqual(str(self.dashboard.total_wallet), '1000.00')
        self.assertEqual(self.client.get('/api/simulator/').data['wallet'], '1000.00')

    def test_six_lotto_check_uses_each_country_prize_structure(self):
        korea = Country.objects.create(code='KR', name='Korea', currency='KRW')
        country_prizes = (
            (self.country, ['1000.00', '500.00', '250.00', '100.00', '50.00']),
            (korea, ['9000.00', '7000.00', '5000.00', '3000.00', '1000.00']),
        )
        purchase = LotteryPurchase.objects.create(
            user=self.user,
            round_number=1,
            total_cost='0.00',
            orders=[],
        )
        tickets = []

        for country, prizes in country_prizes:
            LotteryRule.objects.create(
                country=country,
                game_type='loto6',
                title='LOTO 6',
                prize_structure=[
                    {'label': f'Reward {rank}', 'amount': amount}
                    for rank, amount in enumerate(prizes, start=1)
                ],
            )
            ticket = SixLottoOrder.objects.create(
                user=self.user,
                order=purchase,
                country=country,
            )
            tickets.append((ticket, prizes[1]))
            saved = self.client.post(
                '/api/save/sixlotto/',
                {
                    'six_order_id': ticket.pk,
                    'number_selected': [1, 2, 3, 4, 5, 7],
                },
                format='json',
            )
            self.assertEqual(saved.status_code, 200)

            for ranking in range(1, 6):
                winning_numbers = (
                    [1, 2, 3, 4, 5, 6]
                    if ranking == 1
                    else list(range(10 + (ranking - 2) * 6, 16 + (ranking - 2) * 6))
                )
                SixLottoGen.objects.create(
                    country=country,
                    trans_date=timezone.localdate(),
                    id_set=1,
                    ranking=ranking,
                    number_win=winning_numbers,
                    bonus_number=7 if ranking == 1 else 36 + ranking,
                )

        response = self.client.post(f'/api/check/reward/sixlotto/{self.user.username}/')

        self.assertEqual(response.status_code, 200)
        for ticket, expected_reward in tickets:
            ticket.refresh_from_db()
            self.assertEqual(ticket.prize_rank, 2)
            self.assertEqual(str(ticket.prize_reward), expected_reward)

        self.dashboard.refresh_from_db()
        self.assertEqual(str(self.dashboard.total_wallet), '8000.00')

    def test_daily_reward_set_is_selected_only_after_all_round_numbers_are_saved(self):
        LotteryRule.objects.create(
            country=self.country,
            game_type='loto6',
            title='LOTO 6',
            ticket_price='200.00',
        )
        self.dashboard.total_wallet = '1000.00'
        self.dashboard.save(update_fields=['total_wallet'])
        purchase_response = self.client.post(
            '/api/purchase/lottery/',
            {'items': [{'country_id': self.country.id, 'game_type': 'loto6', 'quantity': 2}]},
            format='json',
        )
        purchase_id = purchase_response.data['purchase_id']
        tickets = purchase_response.data['six_tickets']

        other_user = get_user_model().objects.create_user(
            username='other-lotto-player',
            password='other-lotto-pass-123',
        )
        Dashboard.objects.create(user=other_user)
        other_client = APIClient()
        other_token = Token.objects.create(user=other_user)
        other_client.credentials(HTTP_AUTHORIZATION=f'Token {other_token.key}')
        other_purchase = other_client.post(
            '/api/purchase/lottery/',
            {'items': [{'country_id': self.country.id, 'game_type': 'loto6', 'quantity': 1}]},
            format='json',
        )

        self.assertEqual(purchase_response.status_code, 200)
        self.assertEqual(other_purchase.status_code, 200)
        self.assertEqual(
            SixLottoRoundDraw.objects.filter(purchase_id=purchase_id).count(),
            0,
        )
        self.assertEqual(
            SixLottoRoundDraw.objects.filter(purchase_id=other_purchase.data['purchase_id']).count(),
            0,
        )

        staff_user = get_user_model().objects.create_user(
            username='daily-reward-admin',
            password='daily-reward-admin-pass-123',
            is_staff=True,
        )
        staff_client = APIClient()
        staff_token = Token.objects.create(user=staff_user)
        staff_client.credentials(HTTP_AUTHORIZATION=f'Token {staff_token.key}')
        generated = staff_client.post('/api/daily/reward/sixlotto/')
        self.assertEqual(generated.status_code, 201)

        self.assertEqual(
            self.client.get('/api/daily/reward/sixlotto/').data['rewards'],
            [],
        )
        self.assertEqual(
            other_client.get('/api/daily/reward/sixlotto/').data['rewards'],
            [],
        )
        other_ticket = other_purchase.data['six_tickets'][0]
        self.assertEqual(
            other_client.post(
                '/api/save/sixlotto/',
                {'six_order_id': other_ticket['id'], 'number_selected': [1, 2, 3, 4, 5, 6]},
                format='json',
            ).status_code,
            200,
        )
        self.assertEqual(other_client.get('/api/daily/reward/sixlotto/').data['rewards'], [])
        other_check = other_client.post(f'/api/check/reward/sixlotto/{other_user.username}/')
        self.assertEqual(other_check.status_code, 200)
        self.assertEqual(len(other_client.get('/api/daily/reward/sixlotto/').data['rewards']), 5)
        self.assertEqual(self.client.get('/api/daily/reward/sixlotto/').data['rewards'], [])

        first_saved = self.client.post(
            '/api/save/sixlotto/',
            {'six_order_id': tickets[0]['id'], 'number_selected': [1, 2, 3, 4, 5, 6]},
            format='json',
        )
        check_before_round_complete = self.client.post(
            f'/api/check/reward/sixlotto/{self.user.username}/',
        )
        self.assertEqual(first_saved.status_code, 200)
        self.assertEqual(check_before_round_complete.data['pending_rounds'], [1])
        self.assertEqual(
            self.client.get('/api/daily/reward/sixlotto/').data['rewards'],
            [],
        )

        second_saved = self.client.post(
            '/api/save/sixlotto/',
            {'six_order_id': tickets[1]['id'], 'number_selected': [7, 8, 9, 10, 11, 12]},
            format='json',
        )
        self.assertEqual(second_saved.status_code, 200)
        self.assertEqual(self.client.get('/api/daily/reward/sixlotto/').data['rewards'], [])
        current_check = self.client.post(f'/api/check/reward/sixlotto/{self.user.username}/')
        revealed_rewards = self.client.get('/api/daily/reward/sixlotto/')

        self.assertEqual(current_check.status_code, 200)
        self.assertEqual(len(revealed_rewards.data['rewards']), 5)
        self.assertEqual(revealed_rewards.data['rounds'], [1])
        self.assertTrue(all(reward['round_number'] == 1 for reward in revealed_rewards.data['rewards']))
        self.assertEqual(revealed_rewards.data['id_set'], current_check.data['id_set'])

        next_round = self.client.post(
            '/api/purchase/lottery/',
            {'items': [{'country_id': self.country.id, 'game_type': 'loto6', 'quantity': 1}]},
            format='json',
        )
        self.assertEqual(next_round.status_code, 200)
        next_round_purchase = LotteryPurchase.objects.get(pk=next_round.data['purchase_id'])
        self.assertEqual(next_round_purchase.round_number, 2)
        self.assertEqual(next_round_purchase.six_lotto_draws.count(), 0)
        self.assertEqual(
            self.client.get('/api/daily/reward/sixlotto/').data['rounds'],
            [],
        )
        current_summary = self.client.get('/api/result/summary/')
        self.assertEqual(current_summary.data['total_cost'], '200.00')
        self.assertEqual(
            {entry['round_number'] for entry in current_summary.data['summary']},
            {2},
        )
        self.assertEqual(
            self.client.post(
                '/api/save/sixlotto/',
                {
                    'six_order_id': next_round.data['six_tickets'][0]['id'],
                    'number_selected': [13, 14, 15, 16, 17, 18],
                },
                format='json',
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.post(f'/api/check/reward/sixlotto/{self.user.username}/').status_code,
            200,
        )
        current_rewards = self.client.get('/api/daily/reward/sixlotto/')
        self.assertEqual(current_rewards.data['rounds'], [2])
        self.assertTrue(all(reward['round_number'] == 2 for reward in current_rewards.data['rewards']))
        selected_id_set = current_rewards.data['id_set']
        selected_numbers = [reward['number_win'] for reward in current_rewards.data['rewards']]
        regenerated = staff_client.post('/api/daily/reward/sixlotto/')
        checked_again = self.client.post(f'/api/check/reward/sixlotto/{self.user.username}/')
        current_rewards_after_regeneration = self.client.get('/api/daily/reward/sixlotto/')
        self.assertEqual(regenerated.status_code, 201)
        self.assertEqual(checked_again.data['id_set'], selected_id_set)
        self.assertEqual(current_rewards_after_regeneration.data['id_set'], selected_id_set)
        self.assertEqual(
            [reward['number_win'] for reward in current_rewards_after_regeneration.data['rewards']],
            selected_numbers,
        )

    def test_user_cannot_check_another_users_six_lotto_orders(self):
        response = self.client.post('/api/check/reward/sixlotto/9999/')

        self.assertEqual(response.status_code, 403)

    def test_daily_reward_generation_replaces_todays_ten_sets(self):
        LotteryRule.objects.create(
            country=self.country,
            game_type='loto6',
            title='LOTO 6',
            ticket_price='200.00',
        )
        today = timezone.localdate()
        yesterday = today - timedelta(days=1)
        SixLottoGen.objects.create(
            country=self.country,
            trans_date=today,
            id_set=1,
            ranking=1,
            number_win=[1, 2, 3, 4, 5, 6],
            bonus_number=7,
        )
        old_draw = SixLottoGen.objects.create(
            country=self.country,
            trans_date=yesterday,
            id_set=1,
            ranking=1,
            number_win=[8, 9, 10, 11, 12, 13],
            bonus_number=14,
        )
        self.assertEqual(self.client.post('/api/daily/reward/sixlotto/').status_code, 403)
        staff_user = get_user_model().objects.create_user(
            username='reward-admin',
            password='reward-admin-pass-123',
            is_staff=True,
        )
        staff_client = APIClient()
        staff_token = Token.objects.create(user=staff_user)
        staff_client.credentials(HTTP_AUTHORIZATION=f'Token {staff_token.key}')

        first_generation = staff_client.post('/api/daily/reward/sixlotto/')
        first_draws = list(SixLottoGen.objects.filter(trans_date=today).values_list(
            'id_set', 'country_id', 'ranking', 'number_win', 'bonus_number',
        ))
        second_generation = staff_client.post('/api/daily/reward/sixlotto/')
        todays_draws = SixLottoGen.objects.filter(trans_date=today)

        self.assertEqual(first_generation.status_code, 201)
        self.assertEqual(first_generation.data['set_count'], 10)
        self.assertEqual(first_generation.data['generated_count'], 50)
        self.assertEqual(second_generation.status_code, 201)
        self.assertEqual(todays_draws.count(), 50)
        self.assertEqual(set(todays_draws.values_list('id_set', flat=True)), set(range(1, 11)))
        self.assertEqual(
            set(todays_draws.values_list('id_set', 'ranking')),
            {(id_set, ranking) for id_set in range(1, 11) for ranking in range(1, 6)},
        )
        signatures = [
            tuple(
                (
                    country_id,
                    ranking,
                    tuple(number_win),
                    bonus_number,
                )
                for country_id, ranking, number_win, bonus_number in (
                    todays_draws.filter(id_set=id_set)
                    .order_by('country_id', 'ranking')
                    .values_list('country_id', 'ranking', 'number_win', 'bonus_number')
                )
            )
            for id_set in range(1, 11)
        ]
        self.assertEqual(len(set(signatures)), 10)
        for draw in todays_draws:
            self.assertEqual(len(draw.number_win), 6)
            self.assertEqual(len(set(draw.number_win)), 6)
            self.assertNotIn(draw.bonus_number, draw.number_win)
        self.assertNotEqual(
            list(todays_draws.values_list('id_set', 'country_id', 'ranking', 'number_win', 'bonus_number')),
            first_draws,
        )
        self.assertTrue(SixLottoGen.objects.filter(pk=old_draw.pk).exists())
        self.assertEqual(todays_draws.values('id_set', 'number_win', 'bonus_number').distinct().count(), 50)

    def test_scratch_reward_generation_is_staff_only_and_adds_20_cards_total(self):
        initial_count = ScratchLottoGen.objects.count()
        second_country = Country.objects.create(code='KR', name='Korea', currency='KRW')
        LotteryRule.objects.create(
            country=second_country,
            game_type='scratch',
            title='Scratch lottery',
            ticket_price='100.00',
        )

        guest_response = APIClient().post('/api/daily/reward/scratchlotto/')
        non_staff_response = self.client.post('/api/daily/reward/scratchlotto/')

        self.assertEqual(guest_response.status_code, 401)
        self.assertEqual(non_staff_response.status_code, 403)
        self.assertEqual(ScratchLottoGen.objects.count(), initial_count)

        staff_user = get_user_model().objects.create_user(
            username='scratch-reward-admin',
            password='scratch-admin-pass-123',
            is_staff=True,
        )
        staff_client = APIClient()
        staff_token = Token.objects.create(user=staff_user)
        staff_client.credentials(HTTP_AUTHORIZATION=f'Token {staff_token.key}')
        response = staff_client.post('/api/daily/reward/scratchlotto/')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['generated_count'], 20)
        self.assertEqual(response.data['country_count'], 2)
        self.assertEqual(ScratchLottoGen.objects.count(), initial_count + 20)
        self.assertEqual(ScratchLottoGen.objects.filter(country=self.country).count(), 12)
        self.assertEqual(ScratchLottoGen.objects.filter(country=second_country).count(), 10)

    def test_dashboard_returns_owner_metrics_and_round_history_in_descending_order(self):
        loto_rule = LotteryRule.objects.create(
            country=self.country,
            game_type='loto6',
            title='LOTO 6',
            ticket_price='200.00',
        )
        self.dashboard.total_wallet = '700.00'
        self.dashboard.total_borrowed = '200.00'
        self.dashboard.borrow_count = 1
        self.dashboard.rounds_played = 2
        self.dashboard.save()
        first_purchase = LotteryPurchase.objects.create(
            user=self.user,
            round_number=1,
            total_cost='100.00',
            orders=[],
        )
        second_purchase = LotteryPurchase.objects.create(
            user=self.user,
            round_number=2,
            total_cost=loto_rule.ticket_price,
            orders=[],
        )
        ScratchLottoOrder.objects.create(
            user=self.user,
            order=first_purchase,
            country=self.country,
            scratch_card=self.cards[0],
            opened=True,
            prize_reward='50.00',
        )
        SixLottoOrder.objects.create(
            user=self.user,
            order=second_purchase,
            country=self.country,
            number_selected=[1, 2, 3, 4, 5, 6],
            is_saved=True,
            is_checked=True,
            matches=6,
            prize_rank=1,
            prize_reward='150.00',
        )

        response = self.client.get(f'/api/dashboard/{self.user.username}/')
        other_user_response = self.client.get('/api/dashboard/9999/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['dashboard']['total_wallet'], '700.00')
        self.assertEqual(response.data['dashboard']['total_borrowed'], '200.00')
        self.assertEqual(response.data['dashboard']['rounds_played'], 2)
        self.assertEqual(response.data['dashboard']['total_spent'], '300.00')
        self.assertEqual(response.data['dashboard']['total_prizes_won'], '200.00')
        self.assertEqual(response.data['dashboard']['prize_accumulated'], '200.00')
        self.assertEqual(response.data['dashboard']['net_profit_or_loss'], '-100.00')
        self.assertEqual(
            [entry['round_number'] for entry in response.data['history']],
            [2, 1],
        )
        loto_history = response.data['history'][0]['countries'][0]
        self.assertEqual(loto_history['six_count'], 1)
        self.assertEqual(loto_history['six_tickets'][0]['selected_numbers'], [1, 2, 3, 4, 5, 6])
        self.assertEqual(loto_history['six_tickets'][0]['status'], 'won')
        self.assertEqual(loto_history['six_tickets'][0]['matches'], 6)
        self.assertEqual(loto_history['six_tickets'][0]['prize_reward'], '150.00')
        scratch_history = response.data['history'][1]['countries'][0]
        self.assertEqual(scratch_history['scratch_count'], 1)
        self.assertEqual(scratch_history['scratch_tickets'][0]['status'], 'no_prize')
        self.assertEqual(scratch_history['scratch_tickets'][0]['symbols'], self.cards[0].card_symbols)
        self.assertEqual(scratch_history['scratch_tickets'][0]['prize_reward'], '50.00')
        self.assertIn('date', response.data['history'][0])
        self.assertEqual(other_user_response.status_code, 403)
