# Mermaid Usecase Diagram Sample

```mermaid
---
title: Online Shopping System
---
graph LR
  %% Actors (person shape = stick figure icon)
  User@{ shape: person, label: "User" }
  Admin@{ shape: person, label: "Admin" }

  %% System boundary
  subgraph system["Online Shopping System"]
    UC1@{ shape: ellipse, label: "Browse Products" }
    UC2@{ shape: ellipse, label: "Search Products" }
    UC3@{ shape: ellipse, label: "Add to Cart" }
    UC4@{ shape: ellipse, label: "Checkout" }
    UC5@{ shape: ellipse, label: "View Order History" }
    UC6@{ shape: ellipse, label: "Manage Products" }
    UC7@{ shape: ellipse, label: "View Sales Report" }
  end

  %% User associations
  User --- UC1
  User --- UC2
  User --- UC3
  User --- UC4
  User --- UC5

  %% Admin associations
  Admin --- UC6
  Admin --- UC7

  %% Relationships
  UC4 -.->|"&laquo;include&raquo;"| UC3
  UC2 -.->|"&laquo;extend&raquo;"| UC1
```
