# De configuración global

variable "user" {
  type        = string
  description = "The user to connect to the instance"
}

variable "project" {
  type        = string
  description = "The project to deploy to"
}

variable "project_id" {
  type        = string
  description = "The project ID to deploy to"
}

variable "region" {
  type        = string
  description = "The region to deploy to"
  default     = "europe-southwest1"
}

variable "zone" {
  type        = string
  description = "The zone to deploy to"
  default     = "europe-southwest1-a"
}

variable "json_credentials" {
  type        = string
  description = "The path to the JSON credentials file"
}

# De configuración de la red

variable "network_name" {
  type        = string
  description = "The name of the network"
  default     = "fis-g4-network-cd"
}

variable "firewall_name" {
  type        = string
  description = "The name of the firewall"
  default     = "fis-g4-firewall-cd"
}

# De configuración de la instancia

variable "instance_name" {
  type        = string
  description = "The name of the instance"
}

variable "health_check_name" {
  type        = string
  description = "The name of the health check protocol used by the instance"
}

variable "health_check_path" {
  type        = string
  description = "The path of the health check protocol used by the instance"
}

variable "instance_machine_type" {
  type        = string
  description = "The machine type of the instance"
  default     = "e2-small"
}

variable "instance_image" {
  type        = string
  description = "The OS image used by the instance"
  default     = "ubuntu-os-cloud/ubuntu-1804-lts"
}

# Configuración del grupo de instancias

variable "group_name" {
  type        = string
  description = "The GCE instaces group name"
}

variable "backend_service_name" {
  type        = string
  description = "The GCE backend service name"
  
}

variable "group_description" {
  type        = string
  description = "The GCE instaces group description"
  default = ""
}

# Configuración del router y cloud nat

variable "router_name" {
  type        = string
  description = "The Cloud Router name"
}

variable "cloud_nat_name" {
  type        = string
  description = "The Cloud NAT name"
}

# Configuración SSH

variable "publickeypath" {
  type        = string
  description = "The path to the public key"
  default     = "./.ssh/microserviceSsh.pub"
}

variable "privatekeypath" {
  type        = string
  description = "The path to the private key"
  default     = "./.ssh/microserviceSsh"
}