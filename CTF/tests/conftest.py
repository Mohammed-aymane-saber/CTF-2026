import pytest


@pytest.fixture(autouse=True)
def _admin_mfa_verified_outside_its_tests(request, monkeypatch):
    """Core CTFd tests that load plugins (enable_plugins=True) exercise admin features,
    not MFA. Treat their admin sessions as MFA-verified; tests under
    tests/plugins/admin_mfa run the real gate. Production code has no such switch."""
    if "tests/plugins/admin_mfa" in str(request.node.fspath).replace("\\", "/"):
        yield
        return
    from CTFd.plugins.admin_mfa import gate

    monkeypatch.setattr(gate, "is_verified", lambda row=None: True)
    yield
