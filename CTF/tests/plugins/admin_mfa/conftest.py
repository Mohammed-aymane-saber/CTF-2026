import pytest

from tests.helpers import create_ctfd, destroy_ctfd


@pytest.fixture
def app():
    app = create_ctfd(enable_plugins=True)
    yield app
    destroy_ctfd(app)
