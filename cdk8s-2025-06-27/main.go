package main

import (
	"example.com/cdk8s/imports/k8s"
	"github.com/aws/constructs-go/constructs/v10"
	"github.com/aws/jsii-runtime-go"
	"github.com/cdk8s-team/cdk8s-core-go/cdk8s/v2"
)

type MyChartProps struct {
	cdk8s.ChartProps
}

func NewChart(scope constructs.Construct, id string, ns string, appLabel string) cdk8s.Chart {

	chart := cdk8s.NewChart(scope, jsii.String(id), &cdk8s.ChartProps{
		Namespace: jsii.String(ns),
	})

	labels := map[string]*string{
		"app": jsii.String(appLabel),
	}

	k8s.NewKubeDeployment(chart, jsii.String("deployment"), &k8s.KubeDeploymentProps{
		Spec: &k8s.DeploymentSpec{
			Replicas: jsii.Number(2),
			Selector: &k8s.LabelSelector{
				MatchLabels: &labels,
			},
			Template: &k8s.PodTemplateSpec{
				Metadata: &k8s.ObjectMeta{
					Labels: &labels,
				},
				Spec: &k8s.PodSpec{
					Containers: &[]*k8s.Container{{
						Name:  jsii.String("app-container"),
						Image: jsii.String("mirror.gcr.io/nginx:1.27.5"),
						Ports: &[]*k8s.ContainerPort{{
							ContainerPort: jsii.Number(80),
						}},
					}},
				},
			},
		},
	})

	return chart
}

// class MyChart extends cdk8s.Chart {
//   constructor(scope: Construct, id: string) {
//     super(scope, id);
//     const redis = new Helm(this, 'redis', {
//       chart: 'bitnami/redis',
//       values: {
//         sentinel: {
//           enabled: true
//         }
//       }
//     });
//   }
// }

// https://docs.cilium.io/en/latest/gettingstarted/k8s-install-default/
// https://artifacthub.io/packages/helm/cilium/cilium
//
// func NewCiliumChart(scope constructs.Construct, id string) cdk8s.Chart {
// 	chart := cdk8s.NewChart(scope, jsii.String(id), nil)

// 	cdk8s.NewHelm(chart, jsii.String("cilium"), &cdk8s.HelmProps{
// 		// Chart:   jsii.String("https://helm.cilium.io/cilium"),
// 		// Chart:   jsii.String("cilium/cilium"),
// 		Repo: jsii.String("https://helm.cilium.io"),
// 		Chart:   jsii.String("cilium"),
// 		Namespace: jsii.String("kube-system"),
// 		Version: jsii.String("1.17.3"),
// 		Values: &map[string]interface{}{
// 		},
// 	})
// 	return chart
// }

func main() {
	app := cdk8s.NewApp(nil)
	NewChart(app, "getting-started", "default", "my-app")
	// NewCiliumChart(app, "cilium")
	app.Synth()
}
