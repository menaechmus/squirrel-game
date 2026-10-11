extends Area3D

const SPIN_SPEED := 2.0
const BOB_HEIGHT := 0.1

var _time := 0.0

@onready var _base_y := position.y


func _ready() -> void:
	Game.register_acorn()
	body_entered.connect(_on_body_entered)


func _process(delta: float) -> void:
	_time += delta
	rotate_y(SPIN_SPEED * delta)
	position.y = _base_y + sin(_time * 3.0) * BOB_HEIGHT


func _on_body_entered(_body: Node3D) -> void:
	Game.collect_acorn()
	queue_free()
