from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, HttpResponse
from django.urls import include, path, re_path


def website(request):
    """Production: any page that is not /api/ or /admin/ gets the React app, which then shows the right page."""
    index = settings.FRONTEND_DIST / "index.html"
    if not index.exists():
        return HttpResponse("Website not built yet. Run ./build.sh (or: cd frontend && npm run build).", status=503,
                            content_type="text/plain; charset=utf-8")
    resp = FileResponse(open(index, "rb"), content_type="text/html; charset=utf-8")
    resp["Cache-Control"] = "no-cache"  # always fetch the newest version after an update
    return resp


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("cases.urls")),
    re_path(r"^(?!api/|admin/|static/).*$", website),
]
