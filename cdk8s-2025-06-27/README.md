# cdk8s go

```sh
cdk8s synth   Synthesize k8s manifests to dist/
cdk8s import  Imports k8s API objects to "imports/k8s"

kubectl apply -f dist/
```

```sh
mise run synth
```
