from datetime import timedelta
from django.db.models import Q
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User
from .serializers import RegisterSerializer, UserSerializer

MAX_FAILS, LOCK_MIN = 5, 15

class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        ident = str(request.data.get("identifier", "")).strip()
        pw = str(request.data.get("password", ""))
        user = User.objects.filter(Q(phone=ident) | Q(email__iexact=ident)).first() if ident else None
        now = timezone.now()

        if user and user.locked_until and user.locked_until > now:
            return Response({"code": "locked"}, status=429)

        if not user or not user.check_password(pw) or not user.is_active:
            if user:
                user.failed_attempts += 1
                if user.failed_attempts >= MAX_FAILS:
                    user.locked_until, user.failed_attempts = now + timedelta(minutes=LOCK_MIN), 0
                user.save(update_fields=["failed_attempts", "locked_until"])
            # same message for wrong user / wrong password / unapproved staff
            return Response({"code": "invalid"}, status=401)

        user.failed_attempts, user.locked_until = 0, None
        user.save(update_fields=["failed_attempts", "locked_until"])
        refresh = RefreshToken.for_user(user)
        return Response({"access": str(refresh.access_token), "refresh": str(refresh),
                         "user": UserSerializer(user).data})

class RegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        s = RegisterSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        s.save()
        return Response({"ok": True}, status=201)

class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)

# Family cases endpoints
from rest_framework import generics, permissions
from .serializers import FamilyCaseSerializer, CaseMatchSerializer
from .models import FamilyCase, CaseMatch

class FamilyCaseListCreateView(generics.ListCreateAPIView):
    """List cases for the authenticated family user, or create a new case."""
    serializer_class = FamilyCaseSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Only return cases belonging to the requesting user
        return FamilyCase.objects.filter(user=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class CaseMatchListView(generics.ListAPIView):
    """List matches for a given case. Accessible by the case owner."""
    serializer_class = CaseMatchSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        case_id = self.kwargs.get('case_id')
        # Ensure the case belongs to the user
        try:
            case = FamilyCase.objects.get(id=case_id, user=self.request.user)
        except FamilyCase.DoesNotExist:
            return CaseMatch.objects.none()
        return CaseMatch.objects.filter(case=case).order_by('-created_at')
