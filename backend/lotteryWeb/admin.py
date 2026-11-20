from django.contrib import admin

# Register your models here.

from .models import ( 
    Country,
    LotteryRule,
    Dashboard,
    ScratchLottoGen,
    LotteryPurchase,
    ScratchLottoOrder,
    SixLottoGen,
    SixLottoOrder,
    SixLottoRoundDraw,
    LotteryRoundLoan,
)


admin.site.register(Country)
admin.site.register(LotteryRule)
admin.site.register(Dashboard)
admin.site.register(ScratchLottoGen)
admin.site.register(LotteryPurchase)
admin.site.register(ScratchLottoOrder)
admin.site.register(SixLottoGen)
admin.site.register(SixLottoOrder)
admin.site.register(SixLottoRoundDraw)
admin.site.register(LotteryRoundLoan)