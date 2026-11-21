import random
import re
import uuid
from decimal import Decimal

from django.contrib.auth import authenticate, get_user_model
from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.authtoken.models import Token
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


User = get_user_model()
LOAN_AMOUNT = Decimal('2000.00')
SCRATCH_BATCH_SIZE = 50
SCRATCH_SYMBOLS = ('💰', '☘', '🍀', '⭐', '🎁', '🔔', '🍒', '🎲')
_RANDOM = random.SystemRandom()

# Create your views here.
def _money(value):
    return f'{Decimal(value):.2f}'

def _guide_data(country):
    return {
        'code': country.code,
        'name': country.name,
        'currency': country.currency,
        'description': country.description,
        'purchase_locations': country.purchase_locations,
        'available_games': country.game_types,
        'guides': [
            {
                'id': rule.id,
                'type': rule.game_type,
                'title': rule.title,
                'price': _money(rule.ticket_price),
                'game_description': rule.description,
                'game_rules': rule.rules,
                'rewards': [
                    {
                        'label': reward['label'],
                        'prize_reward': reward.get('amount', reward.get('prize_reward')),
                    }
                    for reward in rule.prize_structure
                ],
            }
            for rule in country.rules.all()
        ],
    }

def _dashboard_data(dashboard):
    return {
        'user_id': dashboard.user_id,
        'username': dashboard.user.username,
        'total_wallet': _money(dashboard.total_wallet),
        'total_borrowed': _money(dashboard.total_borrowed),
        'borrow_count': dashboard.borrow_count,
        'prize_accumulated': _money(dashboard.prize_accumulated),
        'rounds_played': dashboard.rounds_played,
        'net_profit_or_loss': _money(dashboard.net_profit_or_loss),
        'status': dashboard.status_wallet,
        'total_summary': dashboard.total_summary,
    }

def _dashboard_for(user):
    dashboard, _ = Dashboard.objects.get_or_create(user=user)
    return dashboard

def _scratch_card_symbols(prize_tier):
    if prize_tier == 1:
        matched_symbols = ['💰']
        symbols = ['💰', '💰'] + _RANDOM.sample(
            [symbol for symbol in SCRATCH_SYMBOLS if symbol != '💰'],
            4,
        )
    elif prize_tier == 2:
        matched_symbol = _RANDOM.choice(SCRATCH_SYMBOLS[1:])
        matched_symbols = [matched_symbol]
        symbols = [matched_symbol, matched_symbol] + _RANDOM.sample(
            [symbol for symbol in SCRATCH_SYMBOLS if symbol != matched_symbol],
            4,
        )
    elif prize_tier == 3:
        matched_symbols = _RANDOM.sample(SCRATCH_SYMBOLS, 2)
        symbols = [
            *matched_symbols,
            *matched_symbols,
            *_RANDOM.sample(
                [symbol for symbol in SCRATCH_SYMBOLS if symbol not in matched_symbols],
                2,
            ),
        ]
    else:
        matched_symbols = []
        symbols = _RANDOM.sample(SCRATCH_SYMBOLS, 6)

    _RANDOM.shuffle(symbols)
    return symbols, matched_symbols

def _generate_scratch_cards(country, count):
    full_batches, remainder = divmod(count, SCRATCH_BATCH_SIZE)
    prize_tiers = []
    for _ in range(full_batches):
        prize_tiers.extend([1] * 3 + [2] * 5 + [3] * 10 + [0] * 32)
    if remainder:
        prize_tiers.extend(
            _RANDOM.choices((1, 2, 3, 0), weights=(3, 5, 10, 32), k=remainder)
        )
    _RANDOM.shuffle(prize_tiers)

    cards = []
    for prize_tier in prize_tiers:
        symbols, matched_symbols = _scratch_card_symbols(prize_tier)
        cards.append(ScratchLottoGen(
            country=country,
            card_code=f'{country.code}-SCRATCH-{uuid.uuid4().hex[:10].upper()}',
            card_symbols=symbols,
            card_win={
                'is_winner': prize_tier,
                'symbols_won': matched_symbols,
            },
        ))
    ScratchLottoGen.objects.bulk_create(cards)


def _create_daily_six_lotto_sets(draw_date, countries):
    number_pool = list(range(1, 44))
    draws = []
    signatures = set()
    for id_set in range(1, 11):
        while True:
            reward_set = []
            signature = []
            for country in countries:
                for ranking in range(1, 6):
                    winning_numbers = sorted(_RANDOM.sample(number_pool, 6))
                    bonus_pool = [number for number in number_pool if number not in winning_numbers]
                    bonus_number = _RANDOM.choice(bonus_pool)
                    signature.append((country.pk, tuple(winning_numbers), bonus_number))
                    reward_set.append(SixLottoGen(
                        country=country,
                        trans_date=draw_date,
                        id_set=id_set,
                        ranking=ranking,
                        number_win=winning_numbers,
                        bonus_number=bonus_number,
                    ))
            signature = tuple(signature)
            if signature not in signatures:
                signatures.add(signature)
                draws.extend(reward_set)
                break
    SixLottoGen.objects.bulk_create(draws)


def _ensure_scratch_inventory(country, required_available=SCRATCH_BATCH_SIZE):
    locked_country = Country.objects.select_for_update().get(pk=country.pk)
    available = ScratchLottoGen.objects.filter(
        country=locked_country,
        is_available=True,
    ).count()
    target = max(SCRATCH_BATCH_SIZE, required_available)
    if available < target:
        _generate_scratch_cards(locked_country, target - available)

@api_view(['POST'])
@permission_classes([AllowAny])
def create_user(request):
    username = request.data.get('username', '')
    password = request.data.get('password', '')
    if not isinstance(username, str) or not username.strip() or not isinstance(password, str) or not password:
        return Response({'detail': 'username and password are required.'}, status=status.HTTP_400_BAD_REQUEST)
    username = username.strip()
    if len(password) < 10:
        return Response({'detail': 'password must contain at least 10 characters.'}, status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(username=username).exists():
        return Response({'detail': 'username is already taken.'}, status=status.HTTP_409_CONFLICT)

    user = User.objects.create_user(username=username, password=password)
    dashboard = Dashboard.objects.create(user=user)
    token, _ = Token.objects.get_or_create(user=user)
    return Response({
        'id': user.id,
        'username': user.username,
        'created': user.date_joined,
        'token': token.key,
        'dashboard': _dashboard_data(dashboard),
    }, status=status.HTTP_201_CREATED)

@api_view(['POST'])
@permission_classes([AllowAny])
def login_endpoint(request):
    username = request.data.get('username', '')
    password = request.data.get('password', '')
    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response({'detail': 'Invalid username or password.'}, status=status.HTTP_400_BAD_REQUEST)
    token, _ = Token.objects.get_or_create(user=user)
    print("user id",user)
    return Response({'token': token.key, 'id': user.id, 'username': user.username})

@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def logout_endpoint(request):
    request.auth.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)

#api
@api_view(['GET'])
@permission_classes([AllowAny])
def guide_countries(request):
    countries = (
        Country.objects.filter(rules__isnull=False)
        .distinct()
        .prefetch_related('rules')
        .order_by('name')
    )
    return Response({'countries': [_guide_data(country) for country in countries]})



@api_view(['GET'])
@transaction.atomic
@authentication_classes([TokenAuthentication])
@permission_classes([AllowAny])
def simulator_data(request):
    dashboard = _dashboard_for(request.user) if request.user.is_authenticated else None
    current_round = dashboard.rounds_played + 1 if dashboard else None
    round_loan = (
        LotteryRoundLoan.objects.filter(
            user=request.user,
            round_number=current_round,
        ).first()
        if dashboard else None
    )
    wallet = dashboard.total_wallet if dashboard else Decimal('0.00')
    if round_loan and not round_loan.is_applied:
        wallet += round_loan.amount
    countries = (
        Country.objects.filter(rules__isnull=False)
        .distinct()
        .prefetch_related('rules')
        .order_by('name')
    )
    countries = list(countries)
    if dashboard:
        for country in countries:
            if any(rule.game_type == 'scratch' for rule in country.rules.all()):
                _ensure_scratch_inventory(country)

    return Response({
        'wallet': _money(wallet),
        'base_wallet': _money(dashboard.total_wallet) if dashboard else '0.00',
        'prize_accumulated': _money(dashboard.prize_accumulated) if dashboard else '0.00',
        'loan_amount': _money(LOAN_AMOUNT) if dashboard else '0.00',
        'loan_used': bool(round_loan),
        'round_number': current_round,
        'countries': [
            {
                'id': country.id,
                'code': country.code,
                'name': country.name,
                'games': [
                    {
                        'type': rule.game_type,
                        'price': _money(rule.ticket_price) if dashboard else '0.00',
                    }
                    for rule in country.rules.all()
                ],
                'scratch_cards_available': (
                    country.scratch_cards.filter(is_available=True).count()
                    if dashboard else 0
                ),
            }
            for country in countries
        ],
    })

@api_view(['POST'])
@transaction.atomic
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def borrow_money(request):
    dashboard, _ = Dashboard.objects.select_for_update().get_or_create(user=request.user)
    round_number = dashboard.rounds_played + 1
    existing_loan = LotteryRoundLoan.objects.filter(
        user=request.user,
        round_number=round_number,
    ).first()
    if existing_loan:
        return Response(
            {'detail': 'A loan has already been used for this round.'},
            status=status.HTTP_409_CONFLICT,
        )
    round_loan = LotteryRoundLoan.objects.create(
        user=request.user,
        round_number=round_number,
        amount=LOAN_AMOUNT,
    )
    return Response({
        'loan_amount': _money(round_loan.amount),
        'wallet': _money(dashboard.total_wallet + round_loan.amount),
        'round_number': round_number,
        'loan_used': True,
        'dashboard': _dashboard_data(dashboard),
    })

@api_view(['POST'])
@transaction.atomic
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def purchase_lottery(request):
    items = request.data.get('items')
    if not isinstance(items, list) or not items:
        return Response({'detail': 'At least one purchase item is required.'}, status=status.HTTP_400_BAD_REQUEST)

    quantities = {}
    for item in items:
        if not isinstance(item, dict):
            return Response({'detail': 'Each purchase item must be an object.'}, status=status.HTTP_400_BAD_REQUEST)
        country_id = item.get('country_id')
        game_type = item.get('game_type')
        quantity = item.get('quantity')
        if not isinstance(country_id, int) or isinstance(country_id, bool) or country_id < 1:
            return Response({'detail': 'A valid country_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if game_type not in {'scratch', 'loto6'}:
            return Response({'detail': 'game_type must be scratch or loto6.'}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(quantity, int) or isinstance(quantity, bool) or quantity < 1:
            return Response({'detail': 'Each quantity must be a positive integer.'}, status=status.HTTP_400_BAD_REQUEST)
        key = (country_id, game_type)
        quantities[key] = quantities.get(key, 0) + quantity

    dashboard, _ = Dashboard.objects.select_for_update().get_or_create(user=request.user)
    next_round = dashboard.rounds_played + 1
    round_loan = (
        LotteryRoundLoan.objects.select_for_update()
        .filter(user=request.user, round_number=next_round)
        .first()
    )
    loan_to_apply = (
        round_loan.amount
        if round_loan and not round_loan.is_applied
        else Decimal('0.00')
    )
    available_wallet = dashboard.total_wallet + loan_to_apply
    purchase_lines = []
    total_cost = Decimal('0.00')

    for (country_id, game_type), quantity in quantities.items():
        country = Country.objects.filter(pk=country_id).first()
        if country is None:
            return Response({'detail': 'Country not found.'}, status=status.HTTP_404_NOT_FOUND)

        rule = LotteryRule.objects.filter(country=country, game_type=game_type).first()
        if rule is None:
            return Response({'detail': f'{game_type} is not available in this country.'}, status=status.HTTP_400_BAD_REQUEST)

        line_cost = rule.ticket_price * quantity
        total_cost += line_cost
        purchase_lines.append({
            'country': country,
            'game_type': game_type,
            'rule': rule,
            'quantity': quantity,
            'cards': [],
        })

    if available_wallet < total_cost:
        return Response({'detail': 'Insufficient wallet balance.'}, status=status.HTTP_409_CONFLICT)

    for line in purchase_lines:
        if line['game_type'] == 'scratch':
            _ensure_scratch_inventory(line['country'], line['quantity'])
            line['cards'] = list(
                ScratchLottoGen.objects.select_for_update()
                .filter(country=line['country'], is_available=True)
                .order_by('?')[:line['quantity']]
            )
            if len(line['cards']) != line['quantity']:
                return Response({'detail': 'Not enough Scratch Lottery cards are available.'}, status=status.HTTP_409_CONFLICT)

    order_summary = {}
    for line in purchase_lines:
        country = line['country']
        summary = order_summary.setdefault(country.pk, {
            'country_id': country.pk,
            'country': country.name,
            'scratch_count': 0,
            'selected_number': 0,
        })
        if line['game_type'] == 'scratch':
            summary['scratch_count'] += line['quantity']
        else:
            summary['selected_number'] += line['quantity']

    purchase = LotteryPurchase.objects.create(
        user=request.user,
        round_number=next_round,
        total_cost=total_cost,
        orders=list(order_summary.values()),
    )

    purchased_cards = []
    purchased_six_tickets = []
    for line in purchase_lines:
        country = line['country']
        if line['game_type'] == 'scratch':
            ScratchLottoGen.objects.filter(
                pk__in=[card.pk for card in line['cards']],
            ).update(is_available=False)
            scratch_orders = ScratchLottoOrder.objects.bulk_create([
                ScratchLottoOrder(
                    user=request.user,
                    order=purchase,
                    country=country,
                    scratch_card=card,
                )
                for card in line['cards']
            ])
            purchased_cards.extend({
                'id': scratch_order.pk,
                'country_id': country.pk,
                'country': country.name,
                'card_code': scratch_order.scratch_card.card_code,
            } for scratch_order in scratch_orders)
        else:
            six_orders = SixLottoOrder.objects.bulk_create([
                SixLottoOrder(
                    user=request.user,
                    order=purchase,
                    country=country,
                )
                for _ in range(line['quantity'])
            ])
            purchased_six_tickets.extend({
                'id': six_order.pk,
                'country_id': country.pk,
                'country': country.name,
                'selected': [],
            } for six_order in six_orders)

    dashboard.total_wallet = available_wallet - total_cost
    if loan_to_apply:
        dashboard.total_borrowed += loan_to_apply
        dashboard.borrow_count += 1
        round_loan.is_applied = True
        round_loan.save(update_fields=['is_applied'])
    dashboard.rounds_played += 1
    dashboard.save(update_fields=[
        'total_wallet', 'total_borrowed', 'borrow_count',
        'rounds_played', 'updated_at',
    ])

    return Response({
        'purchase_id': purchase.pk,
        'transaction_id': str(purchase.transaction_id),
        'round_number': purchase.round_number,
        'total_cost': _money(total_cost),
        'cards': purchased_cards,
        'six_tickets': purchased_six_tickets,
        'dashboard': _dashboard_data(dashboard),
    }, status=status.HTTP_200_OK)


def _country_payload(country):
    return {'id': country.pk, 'name': country.name, 'code': country.code}


def _prize_amount(rule, prize_rank):
    if not rule or not isinstance(rule.prize_structure, list):
        return Decimal('0.00')
    if prize_rank < 1 or prize_rank > len(rule.prize_structure):
        return Decimal('0.00')
    reward = rule.prize_structure[prize_rank - 1]
    if not isinstance(reward, dict):
        return Decimal('0.00')
    amount = reward.get('amount', reward.get('prize_reward', 0))
    if isinstance(amount, (int, float, Decimal)):
        return Decimal(str(amount))
    if isinstance(amount, str):
        normalized = amount.replace(',', '')
        match = re.search(r'-?\d+(?:\.\d+)?', normalized)
        if match:
            return Decimal(match.group())
    return Decimal('0.00')


def _scratch_order_payload(ticket):
    opened = ticket.opened
    card = ticket.scratch_card
    card_win = card.card_win if opened and isinstance(card.card_win, dict) else {}
    stored_card_win = card.card_win if isinstance(card.card_win, dict) else {}
    target_symbols = stored_card_win.get('symbols_won', [])
    if not isinstance(target_symbols, list) or not target_symbols:
        card_symbols = set(card.card_symbols) if isinstance(card.card_symbols, list) else set()
        target_symbol = next(
            (symbol for symbol in SCRATCH_SYMBOLS if symbol not in card_symbols),
            None,
        )
        target_symbols = [target_symbol] if target_symbol else []
    is_winner = bool(card_win.get('is_winner', 0)) if opened else None
    return {
        'id': ticket.pk,
        'country': _country_payload(ticket.country),
        'card_code': card.card_code,
        'opened': opened,
        'symbols': card.card_symbols,
        'target_symbols': target_symbols,
        'is_winner': is_winner,
        'matches': ticket.matches if opened else None,
        'prize_reward': _money(ticket.prize_reward) if opened else None,
        'created_at': ticket.created,
    }


def _six_order_payload(ticket):
    return {
        'id': ticket.pk,
        'country': _country_payload(ticket.country),
        'selected': ticket.number_selected,
        'is_saved': ticket.is_saved,
        'is_checked': ticket.is_checked,
        'matches': ticket.matches if ticket.is_checked else None,
        'prize_reward': _money(ticket.prize_reward) if ticket.is_checked else None,
        'prize_rank': ticket.prize_rank if ticket.is_checked else None,
        'bonus_match': ticket.bonus_match if ticket.is_checked else False,
        'checked_date': ticket.checked_date.isoformat() if ticket.checked_date else None,
        'created_at': ticket.created,
    }


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def orders_for_user(request, username):
    if request.user.username != username:
        return Response({'detail': 'You can only view your own lottery orders.'}, status=status.HTTP_403_FORBIDDEN)

    purchases = (
        LotteryPurchase.objects.filter(user=request.user)
        .prefetch_related(
            'scratch_tickets__country',
            'scratch_tickets__scratch_card',
            'six_tickets__country',
        )
    )
    return Response({
        'purchases': [
            {
                'id': purchase.pk,
                'transaction_id': str(purchase.transaction_id),
                'round_number': purchase.round_number,
                'total_cost': _money(purchase.total_cost),
                'orders': purchase.orders,
                'created_at': purchase.created_at,
                'scratch_tickets': [
                    _scratch_order_payload(ticket)
                    for ticket in purchase.scratch_tickets.all()
                ],
                'six_tickets': [
                    _six_order_payload(ticket)
                    for ticket in purchase.six_tickets.all()
                ],
            }
            for purchase in purchases
        ],
    })


@api_view(['POST'])
@transaction.atomic
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def open_scratch_ticket(request):
    ticket_id = request.data.get('scratch_order_id')
    if not isinstance(ticket_id, int) or isinstance(ticket_id, bool) or ticket_id < 1:
        return Response({'detail': 'A valid scratch_order_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
    ticket = (
        ScratchLottoOrder.objects.select_for_update()
        .select_related('country', 'scratch_card')
        .filter(pk=ticket_id, user=request.user)
        .first()
    )
    if ticket is None:
        return Response({'detail': 'Scratch Lottery order not found.'}, status=status.HTTP_404_NOT_FOUND)
    if not ticket.opened:
        card_win = ticket.scratch_card.card_win
        card_win = card_win if isinstance(card_win, dict) else {}
        prize_rank = card_win.get('is_winner', 0)
        prize_rank = prize_rank if isinstance(prize_rank, int) and not isinstance(prize_rank, bool) else 0
        symbols_won = card_win.get('symbols_won', [])
        if not isinstance(symbols_won, list):
            symbols_won = []
        ticket.matches = sum(
            1 for symbol in ticket.scratch_card.card_symbols
            if symbol in symbols_won
        )
        ticket.prize_reward = _prize_amount(
            LotteryRule.objects.filter(country=ticket.country, game_type='scratch').first(),
            prize_rank,
        )
        ticket.opened = True
        ticket.save(update_fields=['matches', 'prize_reward', 'opened'])
    return Response({'ticket': _scratch_order_payload(ticket)})


@api_view(['POST'])
@transaction.atomic
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def save_six_ticket(request):
    ticket_id = request.data.get('six_order_id')
    selected = request.data.get('number_selected')
    if not isinstance(ticket_id, int) or isinstance(ticket_id, bool) or ticket_id < 1:
        return Response({'detail': 'A valid six_order_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
    if (
        not isinstance(selected, list)
        or len(selected) != 6
        or any(not isinstance(number, int) or isinstance(number, bool) or number < 1 or number > 43 for number in selected)
        or len(set(selected)) != 6
    ):
        return Response({'detail': 'Select six unique numbers between 1 and 43.'}, status=status.HTTP_400_BAD_REQUEST)
    ticket = (
        SixLottoOrder.objects.select_for_update()
        .select_related('country')
        .filter(pk=ticket_id, user=request.user)
        .first()
    )
    if ticket is None:
        return Response({'detail': 'LOTO 6 order not found.'}, status=status.HTTP_404_NOT_FOUND)
    if ticket.is_saved:
        return Response({'detail': 'Number selection has already been saved.'}, status=status.HTTP_409_CONFLICT)
    ticket.number_selected = sorted(selected)
    ticket.is_saved = True
    ticket.save(update_fields=['number_selected', 'is_saved'])
    return Response({'ticket': _six_order_payload(ticket)})


@api_view(['GET', 'POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def show_reward_lotto6(request):
    if request.method == 'POST':
        if not request.user.is_staff:
            return Response(
                {'detail': 'Only staff users can generate daily LOTO 6 rewards.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        draw_date = timezone.localdate()
        countries = list(
            Country.objects.filter(rules__game_type='loto6')
            .distinct()
            .order_by('pk')
        )
        if not countries:
            return Response(
                {'detail': 'No countries have LOTO 6 available.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            SixLottoGen.objects.filter(trans_date=draw_date).delete()
            _create_daily_six_lotto_sets(draw_date, countries)
        return Response({
            'trans_date': draw_date.isoformat(),
            'set_count': 10,
            'prizes_per_set': 5,
            'generated_count': 50 * len(countries),
            'id_sets': list(range(1, 11)),
        }, status=status.HTTP_201_CREATED)

    purchase = LotteryPurchase.objects.filter(user=request.user).order_by('-round_number').first()
    if purchase is None:
        return Response({'rounds': [], 'id_set': None, 'rewards': []})

    tickets = list(purchase.six_tickets.all())
    if not tickets or any(not ticket.is_saved for ticket in tickets):
        return Response({'rounds': [], 'id_set': None, 'rewards': []})

    draws = purchase.six_lotto_draws.filter(id_set__isnull=False).select_related('country')
    id_set = draws.values_list('id_set', flat=True).first()
    if id_set is None:
        return Response({'rounds': [], 'id_set': None, 'rewards': []})
    rewards = [
        {
            'round_number': purchase.round_number,
            'trans_date': draw.trans_date.isoformat() if draw.trans_date else None,
            'id_set': draw.id_set,
            'country': _country_payload(draw.country),
            'ranking': draw.ranking,
            'number_win': draw.number_win,
            'bonus_number': draw.bonus_number,
        }
        for draw in draws
    ]
    return Response({
        'rounds': [purchase.round_number],
        'id_set': id_set,
        'rewards': rewards,
    })


def _lotto6_result(selected, draws, rule):
    best_matches = 0
    best_rank = None
    best_bonus_match = False
    for draw in draws:
        winning_numbers = set(draw.number_win) if isinstance(draw.number_win, list) else set()
        matches = len(set(selected) & winning_numbers)
        bonus_match = draw.bonus_number in selected
        if matches == 6:
            rank = 1
        elif matches == 5 and bonus_match:
            rank = 2
        elif matches == 5:
            rank = 3
        elif matches == 4:
            rank = 4
        elif matches == 3:
            rank = 5
        else:
            rank = None
        if matches > best_matches:
            best_matches = matches
            best_bonus_match = bonus_match
        if rank is not None and (best_rank is None or rank < best_rank):
            best_rank = rank
            best_matches = matches
            best_bonus_match = bonus_match
    return best_matches, best_rank, best_bonus_match, _prize_amount(rule, best_rank) if best_rank else Decimal('0.00')


@api_view(['POST'])
@transaction.atomic
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def check_reward_sixlotto(request, username):
    if request.user.username != username:
        return Response({'detail': 'You can only check your own LOTO 6 orders.'}, status=status.HTTP_403_FORBIDDEN)
    purchase = LotteryPurchase.objects.filter(user=request.user).order_by('-round_number').first()
    if purchase is None:
        return Response({'detail': 'There is no current LOTO 6 purchase to check.'}, status=status.HTTP_400_BAD_REQUEST)

    tickets = list(
        SixLottoOrder.objects.select_for_update()
        .select_related('country', 'order')
        .filter(user=request.user, order=purchase, is_saved=True)
    )
    if not tickets:
        return Response({'detail': 'There are no saved LOTO 6 selections to check.'}, status=status.HTTP_400_BAD_REQUEST)

    pending_rounds = (
        [purchase.round_number]
        if purchase.six_tickets.filter(is_saved=False).exists()
        else []
    )
    ready_tickets = [] if pending_rounds else tickets

    tickets_to_check = [ticket for ticket in ready_tickets if not ticket.is_checked]
    draw_set_id = (
        purchase.six_lotto_draws
        .filter(id_set__isnull=False)
        .values_list('id_set', flat=True)
        .first()
    )
    country_ids = {ticket.country_id for ticket in ready_tickets}

    if tickets_to_check and draw_set_id is None:
        draw_date = timezone.localdate()
        available_sets = (
            SixLottoGen.objects.filter(
                trans_date=draw_date,
                country_id__in=country_ids,
            )
            .values('id_set')
            .annotate(
                country_count=Count('country', distinct=True),
                prize_count=Count('id'),
            )
            .filter(
                country_count=len(country_ids),
                prize_count=5 * len(country_ids),
            )
        )
        set_ids = list(available_sets.values_list('id_set', flat=True))
        if not set_ids:
            return Response({
                'detail': f'No complete LOTO 6 reward sets are available for {draw_date.isoformat()}.',
            }, status=status.HTTP_409_CONFLICT)
        draw_set_id = _RANDOM.choice(set_ids)
        selected_draws = list(
            SixLottoGen.objects.filter(
                trans_date=draw_date,
                id_set=draw_set_id,
                country_id__in=country_ids,
            ).select_related('country')
        )
        if len(selected_draws) != 5 * len(country_ids):
            return Response(
                {'detail': 'The selected LOTO 6 reward set is incomplete.'},
                status=status.HTTP_409_CONFLICT,
            )
        purchase.six_lotto_draws.filter(id_set__isnull=True).delete()
        SixLottoRoundDraw.objects.bulk_create([
            SixLottoRoundDraw(
                purchase=purchase,
                country=draw.country,
                id_set=draw_set_id,
                trans_date=draw_date,
                ranking=draw.ranking,
                number_win=draw.number_win,
                bonus_number=draw.bonus_number,
            )
            for draw in selected_draws
        ])

    draws_by_purchase_country = {}
    if draw_set_id is not None:
        draws = purchase.six_lotto_draws.filter(id_set=draw_set_id).select_related('country')
        for draw in draws:
            draws_by_purchase_country.setdefault(
                (draw.purchase_id, draw.country_id),
                [],
            ).append(draw)

    for ticket in tickets_to_check:
        ticket_draws = draws_by_purchase_country.get((ticket.order_id, ticket.country_id), [])
        if len(ticket_draws) != 5:
            return Response(
                {'detail': f'No complete reward set is available for {ticket.country.name}.'},
                status=status.HTTP_409_CONFLICT,
            )
        rule = LotteryRule.objects.filter(country=ticket.country, game_type='loto6').first()
        matches, prize_rank, bonus_match, prize_reward = _lotto6_result(
            ticket.number_selected,
            ticket_draws,
            rule,
        )
        ticket.matches = matches
        ticket.prize_rank = prize_rank
        ticket.bonus_match = bonus_match
        ticket.prize_reward = prize_reward
        ticket.is_checked = True
        ticket.checked_date = timezone.localdate()
        ticket.save(update_fields=[
            'matches', 'prize_rank', 'bonus_match', 'prize_reward',
            'is_checked', 'checked_date',
        ])
    return Response({
        'id_set': draw_set_id,
        'trans_date': timezone.localdate().isoformat(),
        'rounds_checked': sorted({ticket.order.round_number for ticket in ready_tickets}),
        'pending_rounds': sorted(set(pending_rounds)),
        'results': [_six_order_payload(ticket) for ticket in ready_tickets],
    })


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def result_summary(request):
    results = []
    purchase = LotteryPurchase.objects.filter(user=request.user).order_by('-round_number').first()
    if purchase is None:
        return Response({'summary': []})

    scratch_orders = (
        ScratchLottoOrder.objects.filter(user=request.user, order=purchase)
        .select_related('country', 'order', 'scratch_card')
    )
    for ticket in scratch_orders:
        card_win = ticket.scratch_card.card_win if isinstance(ticket.scratch_card.card_win, dict) else {}
        is_winner = bool(card_win.get('is_winner', 0)) if ticket.opened else None
        results.append({
            'ticket_type': 'scratch',
            'ticket_id': ticket.pk,
            'round_number': ticket.order.round_number,
            'country': _country_payload(ticket.country),
            'status': 'pending' if not ticket.opened else ('won' if is_winner else 'no_prize'),
            'is_winner': is_winner,
            'matches': ticket.matches if ticket.opened else None,
            'prize_reward': _money(ticket.prize_reward) if ticket.opened else None,
        })
    six_orders = (
        SixLottoOrder.objects.filter(user=request.user, order=purchase)
        .select_related('country', 'order')
    )
    for ticket in six_orders:
        is_winner = ticket.prize_rank is not None if ticket.is_checked else None
        results.append({
            'ticket_type': 'loto6',
            'ticket_id': ticket.pk,
            'round_number': ticket.order.round_number,
            'country': _country_payload(ticket.country),
            'number_selected': ticket.number_selected if ticket.is_saved else [],
            'status': (
                'pending' if not ticket.is_saved or not ticket.is_checked
                else ('won' if is_winner else 'no_prize')
            ),
            'is_winner': is_winner,
            'matches': ticket.matches if ticket.is_checked else None,
            'bonus_match': ticket.bonus_match if ticket.is_checked else False,
            'prize_rank': ticket.prize_rank,
            'prize_reward': _money(ticket.prize_reward) if ticket.is_checked else None,
            'checked_date': ticket.checked_date.isoformat() if ticket.checked_date else None,
        })
    return Response({'summary': results})


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def dashboard_for_user(request, username):
    if request.user.username != username:
        return Response({'detail': 'You can only view your own dashboard.'}, status=status.HTTP_403_FORBIDDEN)

    dashboard = _dashboard_for(request.user)
    purchases = list(
        LotteryPurchase.objects.filter(user=request.user)
        .prefetch_related(
            'scratch_tickets__country',
            'scratch_tickets__scratch_card',
            'six_tickets__country',
        )
        .order_by('-round_number')
    )
    history = []
    total_spent = Decimal('0.00')
    total_prizes = Decimal('0.00')

    for purchase in purchases:
        scratch_tickets = list(purchase.scratch_tickets.all())
        six_tickets = list(purchase.six_tickets.all())
        country_ids = {
            ticket.country_id for ticket in scratch_tickets
        } | {
            ticket.country_id for ticket in six_tickets
        }
        rules = {
            (rule.country_id, rule.game_type): rule
            for rule in LotteryRule.objects.filter(
                country_id__in=country_ids,
                game_type__in=('scratch', 'loto6'),
            )
        }
        countries = {}
        for ticket in scratch_tickets:
            entry = countries.setdefault(ticket.country_id, {
                'country': _country_payload(ticket.country),
                'scratch_count': 0,
                'six_count': 0,
                'prize_reward': Decimal('0.00'),
                'scratch_tickets': [],
                'six_tickets': [],
            })
            entry['scratch_count'] += 1
            entry['prize_reward'] += ticket.prize_reward
            card_win = ticket.scratch_card.card_win
            card_win = card_win if isinstance(card_win, dict) else {}
            is_winner = bool(card_win.get('is_winner', 0)) if ticket.opened else None
            entry['scratch_tickets'].append({
                'id': ticket.pk,
                'card_code': ticket.scratch_card.card_code,
                'opened': ticket.opened,
                'status': (
                    'pending' if not ticket.opened
                    else ('won' if is_winner else 'no_prize')
                ),
                'symbols': ticket.scratch_card.card_symbols if ticket.opened else [],
                'matches': ticket.matches if ticket.opened else None,
                'prize_reward': _money(ticket.prize_reward) if ticket.opened else None,
            })
        for ticket in six_tickets:
            entry = countries.setdefault(ticket.country_id, {
                'country': _country_payload(ticket.country),
                'scratch_count': 0,
                'six_count': 0,
                'prize_reward': Decimal('0.00'),
                'scratch_tickets': [],
                'six_tickets': [],
            })
            entry['six_count'] += 1
            entry['prize_reward'] += ticket.prize_reward
            is_winner = ticket.prize_rank is not None if ticket.is_checked else None
            entry['six_tickets'].append({
                'id': ticket.pk,
                'selected_numbers': ticket.number_selected if ticket.is_saved else [],
                'is_saved': ticket.is_saved,
                'is_checked': ticket.is_checked,
                'status': (
                    'pending' if not ticket.is_saved or not ticket.is_checked
                    else ('won' if is_winner else 'no_prize')
                ),
                'matches': ticket.matches if ticket.is_checked else None,
                'prize_rank': ticket.prize_rank if ticket.is_checked else None,
                'bonus_match': ticket.bonus_match if ticket.is_checked else False,
                'prize_reward': _money(ticket.prize_reward) if ticket.is_checked else None,
            })

        country_history = []
        round_prizes = Decimal('0.00')
        for entry in sorted(countries.values(), key=lambda item: item['country']['name']):
            country_id = entry['country']['id']
            scratch_count = entry['scratch_count']
            six_count = entry['six_count']
            scratch_rule = rules.get((country_id, 'scratch'))
            six_rule = rules.get((country_id, 'loto6'))
            country_cost = (
                (scratch_rule.ticket_price * scratch_count if scratch_rule else Decimal('0.00'))
                + (six_rule.ticket_price * six_count if six_rule else Decimal('0.00'))
            )
            prize_reward = entry['prize_reward']
            round_prizes += prize_reward
            country_history.append({
                'country': entry['country'],
                'games': [
                    game_name
                    for game_name, count in (
                        ('Scratch Lottery', scratch_count),
                        ('LOTO 6', six_count),
                    )
                    if count
                ],
                'scratch_count': scratch_count,
                'six_count': six_count,
                'cost': _money(country_cost),
                'prize_reward': _money(prize_reward),
                'scratch_tickets': entry['scratch_tickets'],
                'six_tickets': entry['six_tickets'],
            })

        total_spent += purchase.total_cost
        total_prizes += round_prizes
        history.append({
            'round_number': purchase.round_number,
            'date': timezone.localtime(purchase.created_at).date().isoformat(),
            'created_at': purchase.created_at,
            'total_cost': _money(purchase.total_cost),
            'total_prize': _money(round_prizes),
            'net_result': _money(round_prizes - purchase.total_cost),
            'countries': country_history,
        })

    dashboard_data = _dashboard_data(dashboard)
    dashboard_data.update({
        'total_spent': _money(total_spent),
        'total_prizes_won': _money(total_prizes),
        'prize_accumulated': _money(total_prizes),
        'net_profit_or_loss': _money(total_prizes - total_spent),
    })
    return Response({
        'dashboard': dashboard_data,
        'history': history,
    })

