from django.urls import path
from . import views

urlpatterns = [
    path('api/createuser/', views.create_user, name='api-user'),
    path('api/auth/login/', views.login_endpoint, name='api-login'),
    path('api/auth/logout/', views.logout_endpoint, name='api-logout'),
    path('api/guideCountries/all/', views.guide_countries, name='api-guide-countries'),
    path('api/simulator/', views.simulator_data, name='api-simulator'),
    path('api/borrow/', views.borrow_money, name='api-borrow'),
    path('api/purchase/lottery/', views.purchase_lottery, name='api-purchase-lottery'),
    path('api/orders/<str:username>/', views.orders_for_user, name='api-user-orders'),
    path('api/open/scratchlotto/', views.open_scratch_ticket, name='api-open-scratch'),
    path('api/save/sixlotto/', views.save_six_ticket, name='api-save-six'),
    path('api/daily/reward/sixlotto/', views.show_reward_lotto6, name='api-list-reward-lotto6'),
    path('api/check/reward/sixlotto/<int:user_id>/', views.check_reward_sixlotto, name='api-check-reward-lotto6'),
    path('api/result/summary/', views.result_summary, name='api-result-summary'),
    path('api/dashboard/<int:user_id>/', views.dashboard_for_user, name='api-user-dashboard'),
]
