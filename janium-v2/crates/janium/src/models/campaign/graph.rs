use crate::{
  JaniumError,
  models::campaign::{CampaignStep, CampaignStepLink},
  types::Id,
};
use std::collections::HashMap;

type Graph = petgraph::graphmap::DiGraphMap<Id<CampaignStep>, Id<CampaignStepLink>>;

#[derive(Clone, Debug, Default)]
pub struct CampaignGraph {
  start: Id<CampaignStep>,
  graph: Graph,
  steps: HashMap<Id<CampaignStep>, CampaignStep>,
  links: HashMap<Id<CampaignStepLink>, CampaignStepLink>,
}

impl CampaignGraph {
  pub fn verifier(&self) -> CampaignGraphVerifier {
    CampaignGraphVerifier {
      steps: self.steps.clone(),
      links: self.links.clone(),
    }
  }
  pub fn start(&self) -> Id<CampaignStep> {
    self.start
  }
  pub fn graph(&self) -> &Graph {
    &self.graph
  }
  pub fn steps(&self) -> &HashMap<Id<CampaignStep>, CampaignStep> {
    &self.steps
  }
  pub fn links(&self) -> &HashMap<Id<CampaignStepLink>, CampaignStepLink> {
    &self.links
  }
}

pub struct CampaignGraphVerifier {
  pub steps: HashMap<Id<CampaignStep>, CampaignStep>,
  pub links: HashMap<Id<CampaignStepLink>, CampaignStepLink>,
}

impl CampaignGraphVerifier {
  pub fn validate(self) -> crate::Result<CampaignGraph> {
    for step in self.steps.values() {
      if let Some(weekly_restrictions) = &step.weekly_restrictions {
        weekly_restrictions.validate()?;
      }
    }
    let mut graph = petgraph::graphmap::DiGraphMap::<Id<CampaignStep>, Id<CampaignStepLink>>::with_capacity(
      self.steps.len(),
      self.links.len(),
    );
    for id in self.steps.keys() {
      graph.add_node(*id);
    }
    for link in self.links.values() {
      graph.add_edge(link.prev, link.next, link.id);
    }
    if self.steps.len() <= 1 && self.links.is_empty() {
      return Ok(CampaignGraph {
        start: self.steps.keys().copied().next().unwrap_or(Id::nil()),
        graph,
        steps: self.steps,
        links: self.links,
      });
    }
    let mut start = None;
    for node in graph.nodes() {
      if graph.edges_directed(node, petgraph::Direction::Incoming).count() == 0 {
        if let Some(start) = start {
          return Err(JaniumError::ext_msg(format!(
            "Campaign has multiple start steps: {start} and {node}"
          )));
        }
        start = Some(node);
      }
      if !self.steps.contains_key(&node) {
        return Err(JaniumError::ext_msg(format!(
          "Campaign has link with step {node} that does not exist"
        )));
      }
    }
    let Some(start) = start else {
      return Err(JaniumError::ext_msg("Campaign has no start step"));
    };
    for step in self.steps.values() {
      if !graph.contains_node(step.id) {
        return Err(JaniumError::ext_msg(format!(
          "Campaign has step {} is not in the graph",
          step.id
        )));
      }
    }
    for (prev, next, edge) in graph.all_edges() {
      let Some(link) = self.links.get(edge) else {
        return Err(JaniumError::ext_msg(format!(
          "Campaign has link {edge} does not exist in graph"
        )));
      };
      if link.prev != prev || link.next != next {
        return Err(JaniumError::ext_msg(format!(
          "Campaign has link {edge} that does not match the graph"
        )));
      }
    }
    for link in self.links.values() {
      if !graph.contains_edge(link.prev, link.next) {
        return Err(JaniumError::ext_msg(format!(
          "Campaign has link with id {} that does not match the graph",
          link.id
        )));
      }
    }
    if petgraph::algo::is_cyclic_directed(&graph) {
      return Err(JaniumError::ext_msg("Campaign has a cycle"));
    }
    if petgraph::algo::connected_components(&graph) > 1 {
      return Err(JaniumError::ext_msg("Campaign has multiple components"));
    }

    Ok(CampaignGraph {
      start,
      graph,
      steps: self.steps,
      links: self.links,
    })
  }
}
