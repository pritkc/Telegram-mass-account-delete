from types import SimpleNamespace

from telethon.tl.types import MessageActionContactSignUp, User

from tg_joined_cleaner.scanner import classify_dialog, display_title, is_joined_service_message


def fake_user(*, user_id=1, deleted=False, first_name="Jane", last_name=None, username="jane"):
    return User(
        id=user_id,
        is_self=False,
        contact=False,
        mutual_contact=False,
        deleted=deleted,
        bot=False,
        bot_chat_history=False,
        bot_nochats=False,
        verified=False,
        restricted=False,
        min=False,
        bot_inline_geo=False,
        support=False,
        scam=False,
        apply_min_photo=False,
        fake=False,
        premium=False,
        attach_menu_enabled=False,
        bot_can_edit=False,
        close_friend=False,
        stories_hidden=False,
        stories_unavailable=False,
        contact_require_premium=False,
        bot_business=False,
        bot_has_main_app=False,
        access_hash=None,
        first_name=first_name,
        last_name=last_name,
        username=username,
        phone=None,
        photo=None,
        status=None,
        bot_info_version=None,
        restriction_reason=None,
        bot_inline_placeholder=None,
        lang_code=None,
        emoji_status=None,
        usernames=None,
        stories_max_id=None,
        color=None,
        profile_color=None,
        bot_active_users=None,
        bot_verification_icon=None,
    )


def msg(action):
    return SimpleNamespace(id=99, action=action)


def dialog(user):
    return SimpleNamespace(is_user=True, entity=user)


def test_signup_action_is_structural():
    assert is_joined_service_message(msg(MessageActionContactSignUp()))
    assert not is_joined_service_message(SimpleNamespace(action=None))


def test_single_signup_message_is_target():
    user = fake_user()
    target = classify_dialog(dialog(user), [msg(MessageActionContactSignUp())])
    assert target is not None
    assert target.title == "Jane"
    assert target.message_id == 99


def test_normal_message_is_not_target():
    user = fake_user()
    target = classify_dialog(dialog(user), [msg(None)])
    assert target is None


def test_second_message_fails_closed():
    user = fake_user()
    target = classify_dialog(dialog(user), [msg(MessageActionContactSignUp()), msg(None)])
    assert target is None


def test_deleted_account_placeholder():
    user = fake_user(deleted=True, first_name=None, username=None)
    assert display_title(user) == "*deleted account"
    target = classify_dialog(dialog(user), [msg(MessageActionContactSignUp())])
    assert target is not None
    assert target.deleted is True
    assert target.title == "*deleted account"
