resource "google_compute_router" "fis_g4_router" {
  name    = var.router_name
  region  = var.region
  network = "fis-g4-network-cd"

  bgp {
    asn = 64514
  }
}

resource "google_compute_router_nat" "fis_g4_cloud_nat" {
  name                               = var.cloud_nat_name
  router                             = google_compute_router.fis_g4_router.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}