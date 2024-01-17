resource "google_compute_http_health_check" "learning_service_health_check" {
  name         = var.health_check_name
  request_path = var.health_check_path

  timeout_sec        = 5
  check_interval_sec = 5
}

resource "google_compute_instance_group" "learning_service_group" {
  name        = var.group_name
  description = var.group_description

  instances = [
    google_compute_instance.learning_service_instance.id,
  ]

  named_port {
    name = "http"
    port = "80"
  }

  named_port {
    name = "https"
    port = "443"
  }

  zone = var.zone
}

resource "google_compute_backend_service" "learning_service_backend" {
  name      = var.backend_service_name
  port_name = "http"
  protocol  = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group = google_compute_instance_group.learning_service_group.id
  }

  health_checks = [
    google_compute_http_health_check.learning_service_health_check.id,
  ]
}