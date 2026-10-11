extends CharacterBody3D

const SPEED := 6.0
const ACCEL := 30.0
const JUMP_VELOCITY := 6.0
const TURN_SPEED := 12.0
const MOUSE_SENSITIVITY := 0.003
const PITCH_MIN := deg_to_rad(-65.0)
const PITCH_MAX := deg_to_rad(15.0)

var _gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity")
var _hop_time := 0.0

@onready var _spawn := global_position
@onready var _pivot: Node3D = $CameraPivot
@onready var _spring_arm: SpringArm3D = $CameraPivot/SpringArm3D
@onready var _model: Node3D = $Model


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
			rotate_camera(event.relative * MOUSE_SENSITIVITY)
	elif event is InputEventMouseButton:
		# Click to grab the mouse again after Esc. Ignore clicks emulated from touches.
		if event.pressed and event.device != InputEvent.DEVICE_ID_EMULATION \
				and Game.state == Game.State.PLAYING and not Game.is_mobile:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	elif event.is_action_pressed("ui_cancel"):
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


## Orbit the camera by a yaw/pitch delta in radians. Also called by the touch controls.
func rotate_camera(delta: Vector2) -> void:
	_pivot.rotation.y -= delta.x
	_spring_arm.rotation.x = clampf(_spring_arm.rotation.x - delta.y, PITCH_MIN, PITCH_MAX)


func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= _gravity * delta

	var input := Vector2.ZERO
	if Game.state == Game.State.PLAYING:
		input = Input.get_vector("move_left", "move_right", "move_forward", "move_back")
		if Input.is_action_just_pressed("jump") and is_on_floor():
			velocity.y = JUMP_VELOCITY

	# Move relative to where the camera is looking.
	var direction := Vector3(input.x, 0.0, input.y).rotated(Vector3.UP, _pivot.rotation.y)
	velocity.x = move_toward(velocity.x, direction.x * SPEED, ACCEL * delta)
	velocity.z = move_toward(velocity.z, direction.z * SPEED, ACCEL * delta)

	if direction.length_squared() > 0.01:
		# The model's nose points along +Z.
		var target_yaw := atan2(direction.x, direction.z)
		_model.rotation.y = lerp_angle(_model.rotation.y, target_yaw, TURN_SPEED * delta)
		_hop_time += delta
	else:
		_hop_time = 0.0
	_model.position.y = absf(sin(_hop_time * 14.0)) * 0.08 if is_on_floor() else 0.0

	move_and_slide()

	if global_position.y < -10.0:
		global_position = _spawn
		velocity = Vector3.ZERO
