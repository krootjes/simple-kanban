/**
 * Kanban locale file — English
 * Copy this file and translate the values to localize the app.
 * Load your locale file instead of this one in index.html and settings.html.
 */
window.LOCALE = {
  // General
  app_default_name: 'Kanban',

  // Auth
  login_heading: 'Sign in',
  login_username: 'Username',
  login_password: 'Password',
  login_btn: 'Sign in',
  login_error_invalid: 'Invalid credentials',
  logout: 'Logout',

  // Header / toolbar
  settings: 'Settings',
  filter_all: 'All',
  quick_add_placeholder: 'Quick add card... (Enter to create)',
  quick_add_column_label: 'Column',

  // Board
  add_column: '+ Add column',
  add_card: '+ Add card',
  column_rename_title: 'Rename Column',
  column_add_title: 'Add Column',
  column_field_name: 'Name',
  column_delete_confirm: 'Delete this column? It must be empty.',
  column_has_cards_error: 'Move or delete all cards in this column first.',

  // Card modal
  card_add_title: 'Add Card',
  card_edit_title: 'Edit Card',
  card_field_title: 'Title',
  card_field_required: '(required)',
  card_field_description: 'Description',
  card_field_description_placeholder: 'Optional description...',
  card_field_due_date: 'Due Date',
  card_field_tags: 'Tags',
  card_no_tags_hint: 'No tags yet — add them in Settings.',
  card_delete_confirm: 'Delete this card?',

  // Buttons
  btn_save: 'Save',
  btn_cancel: 'Cancel',
  btn_delete: 'Delete',
  btn_add: 'Add',
  btn_close: 'Close',

  // Settings page
  settings_title: 'Settings',
  settings_back: '← Back to board',
  settings_section_general: 'General',
  settings_section_account: 'Account',
  settings_section_tags: 'Tags',
  settings_app_name_label: 'App Name',
  settings_app_name_placeholder: 'Kanban',
  settings_saved: 'Saved!',
  settings_change_username_heading: 'Change Username',
  settings_new_username: 'New Username',
  settings_current_password: 'Current Password',
  settings_change_username_btn: 'Change Username',
  settings_username_changed: 'Username updated.',
  settings_change_password_heading: 'Change Password',
  settings_new_password: 'New Password',
  settings_confirm_password: 'Confirm New Password',
  settings_change_password_btn: 'Change Password',
  settings_password_changed: 'Password updated.',
  settings_password_mismatch: 'Passwords do not match.',
  settings_no_tags: 'No tags yet.',
  settings_tag_name_placeholder: 'Tag name',
  settings_tag_exists: 'A tag with that name already exists.',
  settings_tag_delete_confirm: 'Delete this tag? It will be removed from all cards.',

  // Errors
  error_save_card: 'Failed to save card',
  error_move_card: 'Failed to move card',
  error_delete_card: 'Failed to delete card',
  error_save_column: 'Failed to save column',
  error_move_column: 'Failed to move column',
  error_delete_column: 'Failed to delete column',
  error_add_tag: 'Failed to add tag',
  error_delete_tag: 'Failed to delete tag',
  error_quick_add: 'Failed to add card',
};
