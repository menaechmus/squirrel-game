extends CanvasLayer

@onready var _acorn_label: Label = $AcornLabel
@onready var _time_label: Label = $TimeLabel
@onready var _start_panel: Control = $StartPanel
@onready var _help_label: Label = $StartPanel/Center/VBox/Help
@onready var _play_button: Button = $StartPanel/Center/VBox/PlayButton
@onready var _win_panel: Control = $WinPanel
@onready var _result_label: Label = $WinPanel/Center/VBox/Result
@onready var _again_button: Button = $WinPanel/Center/VBox/AgainButton


func _ready() -> void:
	Game.acorns_changed.connect(_on_acorns_changed)
	Game.state_changed.connect(_on_state_changed)
	_play_button.pressed.connect(Game.start)
	_again_button.pressed.connect(Game.restart)
	if Game.is_mobile:
		_help_label.text = "Left thumb to move, drag to look around, tap JUMP to jump."
	else:
		_help_label.text = "WASD or arrows to move, mouse to look, Space to jump.\nEsc frees the mouse."
	_on_acorns_changed(Game.collected, Game.total)
	_on_state_changed(Game.state)


func _process(_delta: float) -> void:
	_time_label.text = _format_time(Game.elapsed)


func _on_acorns_changed(collected: int, total: int) -> void:
	_acorn_label.text = "Acorns: %d / %d" % [collected, total]


func _on_state_changed(state: Game.State) -> void:
	_start_panel.visible = state == Game.State.MENU
	_win_panel.visible = state == Game.State.WON
	if state == Game.State.WON:
		_result_label.text = "All %d acorns in %s" % [Game.total, _format_time(Game.elapsed)]


func _format_time(seconds: float) -> String:
	return "%d:%04.1f" % [int(seconds) / 60, fmod(seconds, 60.0)]
