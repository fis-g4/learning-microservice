resource "google_compute_instance" "learning_service_instance" {
  name         = var.instance_name
  machine_type = var.instance_machine_type
  zone         = var.zone

  tags = ["fis-g4-instance", "http-server", "https-server", "lb-health-check"]

  boot_disk {
    initialize_params {
      image = var.instance_image
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.learning_microservice_subnetwork.id

    access_config {
    }
  }

  metadata = {
    ssh-keys = "${var.user}:${file(var.publickeypath)}"
  }

  metadata_startup_script = <<-EOF
  #!/bin/bash
  sudo apt -y update
  sudo apt -y install apt-transport-https ca-certificates curl software-properties-common
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt -y update
  apt-cache policy docker-ce
  sudo apt -y install docker-ce

  mkdir -p ~/.docker/cli-plugins/
  curl -SL https://github.com/docker/compose/releases/download/v2.3.3/docker-compose-linux-x86_64 -o ~/.docker/cli-plugins/docker-compose
  sudo chmod +x ~/.docker/cli-plugins/docker-compose

  cd /home/${var.user}
  git clone https://github.com/fis-g4/learning-microservice.git
  cd learning-microservice
  git checkout develop
  git pull
  export ENV_CONFIGURATION="${file(".env.prod")}"
  export GOOGLE_APPLICATION_CREDENTIALS='${file("GoogleCloudKey.json")}'
  echo "$ENV_CONFIGURATION" > .env
  echo $GOOGLE_APPLICATION_CREDENTIALS > GoogleCloudKey.json
  sudo docker compose up -d
  EOF

  depends_on = []
}