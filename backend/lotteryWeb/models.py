from django.db import models
from django.contrib.auth.models import User
import uuid


class Dashboard(models.Model):
    STATUS_CHOICES = [('profit', 'Profit'), ('loss', 'Loss'), ('normal', 'Normal')]
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='dashboard')
    total_wallet = models.DecimalField(max_digits=14, decimal_places=2, default=1000)
    total_borrowed = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    borrow_count = models.PositiveIntegerField(default=0)
    prize_accumulated = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    accumulated_rewards = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    rounds_played = models.PositiveIntegerField(default=0)
    status_wallet = models.CharField(max_length=16, choices=STATUS_CHOICES, default='normal')
    net_profit_or_loss = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_summary = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dashboard'

    def __str__(self):
        return f'{self.user.username} dashboard'

class Country(models.Model):
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=100, unique=True, db_column='name_country')
    currency = models.CharField(max_length=10, default='THB')
    description = models.TextField(default='')
    purchase_locations = models.JSONField(default=list)
    game_types = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    #example: { 'code': 'JP', 'name': 'Japan', 'currency': 'JPY','description': 'Japan offers a well-structured lottery ecosystem with easy-to-understand rules and transparent prize categories.', 
    # 'purchase_locations': ['Convenience stores', 'Lottery kiosks', 'Official retailers'], 
    # 'game_types': ['Scratch Lottery', 'LOTO 6'], 

    def __str__(self):
        return self.name

    class Meta:
        db_table = 'lotto_countries'

class LotteryRule(models.Model):
    GAME_TYPES = [
        ('scratch', 'Scratch Lottery'),
        ('loto6', 'LOTTO 6'),
    ]

    country = models.ForeignKey(Country, related_name='rules', on_delete=models.CASCADE)
    game_type = models.CharField(max_length=30, choices=GAME_TYPES, default='scratch')
    ticket_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    title = models.CharField(max_length=120)
    description = models.TextField(default='')
    prize_structure = models.JSONField(default=list)
    rules = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    #Example: { 'country': 'Japan', 'game_type': 'scratch', 'ticket_price': 200,
    # 'title': 'Scratch Lottery', 'description': 'Scratch lottery tickets are designed around matching target symbols.',
    # 'prize_structure': [{'label': '1st Prize', 'amount': '¥1000'}, {'label': '2nd Prize', 'amount': '¥200'}, {'label': '3rd Prize', 'amount': '¥30'}],
    # 'rules': ['Players scratch off the ticket to reveal symbols.', 'Match the required symbols to win the corresponding prize.', 'Prizes are claimed at authorized retailers.'] } 

    def __str__(self):
        return f'{self.country.name} - {self.game_type}'


class ScratchLottoGen(models.Model):  #generated scratch card for each country
    country = models.ForeignKey(Country, related_name='scratch_cards', on_delete=models.CASCADE)
    card_code = models.CharField(max_length=40, unique=True) # Example: 'JP-SCRATCH-001'
    card_symbols = models.JSONField(default=list)  # Example: ['🍀', '🍀', '💰', '💰', '🍀', '💰']
    card_win = models.JSONField(default=dict)  # Example: {'is_winner': 1,symbols_won': ['💰']} , {'is_winner': 2,symbols_won': ['🍀']} , {'is_winner': 0,symbols_won': ''} 
    is_available = models.BooleanField(default=True)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'scratch_lotto_gen'
        ordering = ['country_id', 'card_code']

    def __str__(self):
        return self.card_code

class SixLottoGen(models.Model):  #generated six lotto draw for each country 5 rewards
    country = models.ForeignKey(Country, related_name='six_lotto_draws', on_delete=models.CASCADE)
    trans_date = models.DateField() #current date
    id_set = models.PositiveSmallIntegerField(default=1)
    ranking = models.PositiveSmallIntegerField()  # Example: rewards 1, 2, 3, 4, 5
    number_win = models.JSONField(default=list) # Example : [1, 2, 3, 4, 5, 6]
    bonus_number = models.PositiveSmallIntegerField() # Example: 7
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'six_lotto_gen'
        ordering = ['-trans_date', 'id_set', 'country_id', 'ranking']
        constraints = [
            models.UniqueConstraint(
                fields=['country', 'trans_date', 'id_set', 'ranking'],
                name='unique_country_daily_set_rank',
            ),
        ]

    def __str__(self):
        return f'{self.country.name} {self.trans_date} #{self.ranking}'


class LotteryPurchase(models.Model):

    user = models.ForeignKey(User, related_name='lottery_purchase', on_delete=models.CASCADE)
    transaction_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    round_number = models.PositiveIntegerField() 
    total_cost = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    orders = models.JSONField(default=dict)   # Example: {"country": "japan", "scratch_count": 0, "selected_number": 0 },{"country": "korea", "scratch_count": 0, "selected_number": 0 }
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['user', 'round_number'], name='unique_user_lottery_round'),
        ]

    def __str__(self):
        return f'{self.user.username} - Round {self.round_number}'


class SixLottoRoundDraw(models.Model):
    purchase = models.ForeignKey(
        LotteryPurchase,
        related_name='six_lotto_draws',
        on_delete=models.CASCADE,
    )
    country = models.ForeignKey(Country, on_delete=models.PROTECT)
    id_set = models.PositiveSmallIntegerField(null=True, blank=True)
    trans_date = models.DateField(null=True, blank=True)
    ranking = models.PositiveSmallIntegerField()
    number_win = models.JSONField(default=list)
    bonus_number = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'six_lotto_round_draw'
        ordering = ['purchase_id', 'country_id', 'ranking']
        constraints = [
            models.UniqueConstraint(
                fields=['purchase', 'country', 'ranking'],
                name='unique_purchase_country_draw_rank',
            ),
        ]


class LotteryRoundLoan(models.Model):
    user = models.ForeignKey(User, related_name='lottery_round_loans', on_delete=models.CASCADE)
    round_number = models.PositiveIntegerField()
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    is_applied = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'lottery_round_loan'
        constraints = [
            models.UniqueConstraint(fields=['user', 'round_number'], name='unique_user_lottery_round_loan'),
        ]
        ordering = ['-round_number']


class ScratchLottoOrder(models.Model):
    user = models.ForeignKey(User, related_name='bought_scratch_lottos', on_delete=models.CASCADE)
    order = models.ForeignKey(LotteryPurchase, related_name='scratch_tickets', on_delete=models.CASCADE)
    country = models.ForeignKey(Country, on_delete=models.PROTECT)
    scratch_card = models.ForeignKey(ScratchLottoGen, related_name='purchases', on_delete=models.PROTECT)
    opened = models.BooleanField(default=False)
    prize_reward = models.DecimalField(max_digits=14, decimal_places=2, default=0)  
    matches = models.PositiveSmallIntegerField(default=0)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'buy_scratch_lotto'
        ordering = ['-created']


class SixLottoOrder(models.Model):
    user = models.ForeignKey(User, related_name='bought_six_lottos', on_delete=models.CASCADE)
    order = models.ForeignKey(LotteryPurchase, related_name='six_tickets', on_delete=models.CASCADE)
    country = models.ForeignKey(Country, on_delete=models.PROTECT)
    number_selected = models.JSONField(default=list)
    is_saved = models.BooleanField(default=False)
    is_checked = models.BooleanField(default=False)
    prize_reward = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    matches = models.PositiveSmallIntegerField(default=0)
    prize_rank = models.PositiveSmallIntegerField(null=True, blank=True)
    bonus_match = models.BooleanField(default=False)
    checked_date = models.DateField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'buy_six_lotto'
        ordering = ['-created']