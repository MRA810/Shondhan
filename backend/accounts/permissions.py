from rest_framework.permissions import BasePermission


def role_permission(*roles):
    """Permission class that lets in only logged-in users with one of the given roles."""
    class HasRole(BasePermission):
        def has_permission(self, request, view):
            u = request.user
            return bool(u and u.is_authenticated and u.role in roles)
    HasRole.__name__ = "Is" + "Or".join(r.title() for r in roles)
    return HasRole


IsFamily = role_permission("family")
IsReporter = role_permission("police", "medical")
IsOfficer = role_permission("officer", "admin")
IsAdmin = role_permission("admin")
IsAuditor = role_permission("auditor", "admin")
CanBrowseReports = role_permission("police", "officer", "admin")  # every family report, with search and filters
