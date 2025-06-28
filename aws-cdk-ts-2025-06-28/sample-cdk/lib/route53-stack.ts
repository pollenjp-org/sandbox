import { Stack, StackProps } from 'aws-cdk-lib';
import * as route53 from "aws-cdk-lib/aws-route53";
import { Construct } from 'constructs';

type Route53StackCustomProps = {
}

interface Route53StackProps extends StackProps {
  customProps?: Route53StackCustomProps;
}

interface Route53StackCustomOutputProps {
  hostedZone: route53.HostedZone;
}

export class Route53Stack extends Stack {
  public CustomOutProps: Route53StackCustomOutputProps;

  constructor(scope: Construct, id: string, props: Route53StackProps) {
    super(scope, id, props);

    const myZone = new route53.PublicHostedZone(this, 'HostedZone', {
      zoneName: 'sub-abdzds.pollenjp.com',
    });

    this.CustomOutProps = {
      hostedZone: myZone,
    };
  }
}
